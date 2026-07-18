import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import * as crypto from "crypto";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export const onVideoUpload = functions
  .runWith({ timeoutSeconds: 540, memory: "2GB" })
  .storage.object()
  .onFinalize(async (object) => {
    const filePath = object.name;
    const contentType = object.contentType;

    if (!filePath || !contentType) return;
    if (!contentType.startsWith("video/")) {
      return;
    }

    // Expected path: courses/{courseId}/lessons/{lessonId}/{blockId}_{fileName}
    // Length: 5
    const pathParts = filePath.split("/");
    if (pathParts.length !== 5) return;
    if (pathParts[0] !== "courses" || pathParts[2] !== "lessons") return;

    // Prevent infinite loops: skip if already processed (m3u8 or ts files)
    if (filePath.endsWith(".m3u8") || filePath.endsWith(".ts")) return;

    const courseId = pathParts[1];
    const lessonId = pathParts[3];
    const fileName = pathParts[4];
    
    // Extract blockId (assuming format: {blockId}_{originalName})
    const blockIdMatch = fileName.match(/^([^_]+)_(.+)$/);
    if (!blockIdMatch) return;
    const blockId = blockIdMatch[1];
    const originalName = blockIdMatch[2];

    // Validate course ownership
    const courseRef = admin.firestore().collection("courses").doc(courseId);
    const courseSnap = await courseRef.get();
    if (!courseSnap.exists) {
      console.error(`Course ${courseId} does not exist. Aborting video processing.`);
      return;
    }
    
    const courseData = courseSnap.data();
    const uploaderUid = object.metadata?.uploaderUid;
    
    // Check if uploaderUid was provided and matches course creator or instructor
    if (uploaderUid) {
      const isOwner = courseData?.createdBy === uploaderUid || courseData?.instructor?.id === uploaderUid;
      if (!isOwner) {
        console.error(`User ${uploaderUid} is not authorized to process video for course ${courseId}.`);
        return;
      }
    } else {
      console.warn(`No uploaderUid metadata found for video ${filePath}. Assuming authorized or relying on Storage rules.`);
    }

    const bucket = admin.storage().bucket(object.bucket);
    const tempFilePath = path.join(os.tmpdir(), fileName);
    const outputDir = path.join(os.tmpdir(), blockId);
    
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputFileName = `${path.parse(originalName).name}.m3u8`;
    const outputPath = path.join(outputDir, outputFileName);
    const storageOutputDir = path.dirname(filePath);

    try {
      console.log(`Downloading ${filePath} to ${tempFilePath}`);
      await bucket.file(filePath).download({ destination: tempFilePath });

      console.log(`Transcoding ${tempFilePath} to ${outputPath}`);
      await new Promise((resolve, reject) => {
        ffmpeg(tempFilePath)
          .outputOptions([
            "-profile:v baseline",
            "-level 3.0",
            "-start_number 0",
            "-hls_time 10",
            "-hls_list_size 0",
            "-f hls",
          ])
          .output(outputPath)
          .on("end", resolve)
          .on("error", reject)
          .run();
      });

      console.log(`Uploading transcode results to ${storageOutputDir}`);
      const files = fs.readdirSync(outputDir);
      let m3u8Url = "";
      
      const tsFiles = files.filter(f => f.endsWith(".ts"));
      const m3u8File = files.find(f => f.endsWith(".m3u8"));
      
      const tsUrlMap = new Map<string, string>();

      // Upload TS files with download tokens
      for (const file of tsFiles) {
        const localPath = path.join(outputDir, file);
        const destination = path.join(storageOutputDir, "hls", blockId, file);
        const token = crypto.randomUUID();
        
        await bucket.upload(localPath, {
          destination,
          metadata: {
            contentType: "video/mp2t",
            metadata: { firebaseStorageDownloadTokens: token }
          },
        });
        
        const fileUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(destination)}?alt=media&token=${token}`;
        tsUrlMap.set(file, fileUrl);
      }
      
      // Rewrite and upload M3U8 file with download token
      if (m3u8File) {
        const localPath = path.join(outputDir, m3u8File);
        let m3u8Content = fs.readFileSync(localPath, "utf-8");
        
        // Rewrite TS filenames to their full authenticated Firebase Storage URLs
        for (const tsFile of tsFiles) {
          const fileUrl = tsUrlMap.get(tsFile);
          if (fileUrl) {
            // Replace exact whole word match for the ts file at the beginning of the line
            m3u8Content = m3u8Content.replace(new RegExp(`^${tsFile}$`, 'gm'), fileUrl);
          }
        }
        
        fs.writeFileSync(localPath, m3u8Content);

        const destination = path.join(storageOutputDir, "hls", blockId, m3u8File);
        const token = crypto.randomUUID();
        
        await bucket.upload(localPath, {
          destination,
          metadata: {
            contentType: "application/vnd.apple.mpegurl",
            metadata: { firebaseStorageDownloadTokens: token }
          },
        });
        
        m3u8Url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(destination)}?alt=media&token=${token}`;
      }

      console.log(`Updating Firestore block ${blockId} with m3u8 URL: ${m3u8Url}`);
      // Update the block document using set with merge: true to avoid failing if the doc doesn't exist yet
      const blockRef = admin.firestore().collection("courses").doc(courseId).collection("lessons").doc(lessonId).collection("blocks").doc(blockId);
      await blockRef.set({
        content: { url: m3u8Url }
      }, { merge: true });
      
      console.log("Transcoding and update completed successfully.");
    } catch (error) {
      console.error("Error during video processing:", error);
    } finally {
      // Clean up
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      if (fs.existsSync(outputDir)) {
        fs.rmSync(outputDir, { recursive: true, force: true });
      }
    }
  });