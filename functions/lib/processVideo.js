"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.onVideoUpload = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const fs = __importStar(require("fs"));
const fluent_ffmpeg_1 = __importDefault(require("fluent-ffmpeg"));
const ffmpeg_1 = __importDefault(require("@ffmpeg-installer/ffmpeg"));
fluent_ffmpeg_1.default.setFfmpegPath(ffmpeg_1.default.path);
exports.onVideoUpload = functions
    .runWith({ timeoutSeconds: 540, memory: "2GB" })
    .storage.object()
    .onFinalize(async (object) => {
    const filePath = object.name;
    const contentType = object.contentType;
    if (!filePath || !contentType)
        return;
    if (!contentType.startsWith("video/")) {
        return;
    }
    // Expected path: courses/{courseId}/lessons/{lessonId}/{blockId}_{fileName}
    // Length: 5
    const pathParts = filePath.split("/");
    if (pathParts.length !== 5)
        return;
    if (pathParts[0] !== "courses" || pathParts[2] !== "lessons")
        return;
    // Prevent infinite loops: skip if already processed (m3u8 or ts files)
    if (filePath.endsWith(".m3u8") || filePath.endsWith(".ts"))
        return;
    const courseId = pathParts[1];
    const lessonId = pathParts[3];
    const fileName = pathParts[4];
    // Extract blockId (assuming format: {blockId}_{originalName})
    const blockIdMatch = fileName.match(/^([^_]+)_(.+)$/);
    if (!blockIdMatch)
        return;
    const blockId = blockIdMatch[1];
    const originalName = blockIdMatch[2];
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
            (0, fluent_ffmpeg_1.default)(tempFilePath)
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
        for (const file of files) {
            const localPath = path.join(outputDir, file);
            const destination = path.join(storageOutputDir, "hls", blockId, file);
            await bucket.upload(localPath, {
                destination,
                metadata: {
                    contentType: file.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : "video/mp2t",
                },
            });
            // Make the file publicly accessible or get download URL
            const uploadedFile = bucket.file(destination);
            await uploadedFile.makePublic(); // Depending on security, you might use signed URLs or make it public.
            // Assuming public for HLS streams is usually easiest for players, or use Google Cloud Storage URLs.
            if (file.endsWith(".m3u8")) {
                m3u8Url = uploadedFile.publicUrl();
            }
        }
        console.log(`Updating Firestore block ${blockId} with m3u8 URL: ${m3u8Url}`);
        // Update the block document
        const blockRef = admin.firestore().collection("courses").doc(courseId).collection("lessons").doc(lessonId).collection("blocks").doc(blockId);
        await blockRef.update({
            "content.url": m3u8Url
        });
        console.log("Transcoding and update completed successfully.");
    }
    catch (error) {
        console.error("Error during video processing:", error);
    }
    finally {
        // Clean up
        if (fs.existsSync(tempFilePath))
            fs.unlinkSync(tempFilePath);
        if (fs.existsSync(outputDir)) {
            fs.rmSync(outputDir, { recursive: true, force: true });
        }
    }
});
//# sourceMappingURL=processVideo.js.map