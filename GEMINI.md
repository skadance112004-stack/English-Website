Firebase Database Design - Language Learning App
Root Collections
1. courses
Path: courses/{courseId}
courseId: string
title: string
description: string
instructor: {
  id: string
  name: string
  avatar: string
  experience: string
}
thumbnail: string
price: number
level: string
category: string(( some example: Listening, Reading, Writing, Speaking, Vocabulary, Grammar,General, etc)
rating: number
studentCompleted: number
totalRatings: number
totalStudents: number
totalLessons: number
totalExercises: number
totalExams: number
totalDuration: number
createdAt: timestamp
updatedAt: timestamp
tags: array<string>
whatYouLearn: array<string>
firstFiveLessons: array<string>
published: boolean
createdBy: string
aiAssisted: boolean

For published: false (draft courses)
draftStatus: {
  lastEditedAt: timestamp
}


1.1 courses/{courseId}/sections
Path: courses/{courseId}/sections/{sectionId}
sectionId: string
title: string
order: number
totalLessons: number
totalExercises: number
duration: number
createdAt: timestamp


1.2 courses/{courseId}/lessons
Path: courses/{courseId}/lessons/{lessonId}
Purpose: Lightweight document for listing, heavy content in blocks subcollection
lessonId: string
sectionId: string
title: string
description: string
type: string( Listening, Reading, Writing, Speaking, Vocabulary, Grammar,General, etc)
duration: number
order: number
thumbnail: string
metadata: {
  hasVideo: boolean
  hasAudio: boolean
}
createdAt: timestamp
updatedAt: timestamp
aiGenerated: boolean


1.2.1 courses/{courseId}/lessons/{lessonId}/blocks
Path: courses/{courseId}/lessons/{lessonId}/blocks/{blockId}
Purpose: Full lesson content, only fetched when lesson is opened
blockId: string
type: string
order: number
content: object
createdAt: timestamp
aiGenerated: boolean

Content structure by type:
Type: text
content: {
  text: string (html string)
}

Type: heading
content: {
  text: string(html string)
}

Type: video
content: {
  url: string
  thumbnail: string
  title: string
  duration: number
}(Should be reviewed later)

Type: audio
content: {
  url: string
  title: string
  duration: number
  transcript: string(optional)
}
Type: image
content: {
  url: string
  caption: string
}

Type: keyTerms
content: {
  terms: array<{
    word: string
    type: string
    definition: string
  }>
}
(Should be reviewed later)
Type: formula
content: {
  title: string
  steps: array<{
    stepNumber: number
    label: string
    description: string
  }>
}
(Should be reviewed later)
Type: file
content: {
  fileUrl: string
}

1.3 courses/{courseId}/exercises
Path: courses/{courseId}/exercises/{exerciseId}
Purpose: Lightweight document for listing, questions in subcollection
exerciseId: string
sectionId: string
title: string
description: string(optional)
type: string (Reading, Listening,Speaking, Quiz)
metadata: {
  questionCount: number
  duration: number(optional)
  xpReward: number
  pointsReward: number
  passingScore: number
}
order: number
createdAt: timestamp
updatedAt: timestamp
aiGenerated: boolean
 
1.3.1 courses/{courseId}/exercises/{exerciseId}/questions
Path: courses/{courseId}/exercises/{exerciseId}/questions/{questionId}
Purpose: Full question content, only fetched when exercise is started
questionId: string
questionType: string ("MCQ" or "T-F-NG" or  "SHORT ANSWER")
order: number
questionText: string
options: array<{
  optionId: string (A-B-C-D for MCQ, A-B-C (or A-B) for T-F-NG)
  text: string
  isCorrect: boolean
}>(this is MCQ and T-F-NG types)
acceptedAnswers: array<string> (for short answer questions type, each answer must be less than 3 words)
explanation: string ( short explanation why the answer is like that)
(Note that for listening T-F-NG question, even though the type can be "T-F-NG" , could has 2 options only:True and False)

1.3.2 courses/{courseId}/exercises/{exerciseId}/content
Path: courses/{courseId}/exercises/{exerciseId}/content/{contentType}
Purpose: Store heavy content separately (passage, audio transcript, etc.)
Document: passage (for reading exercises) (contentType == passage)
title: string
wordcount: number
thumbnail: string
text: string (html string)

Document: audio (for listening exercises)
url: string
title: string (if null, use exercise/exam title)
duration: number
transcript: {
  full: string
  timestamped: array<{
    speaker: string
    text: string
    startTime: number(second)
    endTime: number (second)
  }>
}


1.3.3 courses/{courseId}/exercises/{exerciseId}/lines
Path: courses/{courseId}/exercises/{exerciseId}/lines/{lineId}
Purpose: Speaking exercise conversation lines
lineId: string
order: number
speaker: string
speakerAvatar: string (avt url,optional, if null then default to some url)
text: string
audioUrl: string (native Audio URL, always exists)
isUserLine: boolean



1.4 courses/{courseId}/exams
Path: courses/{courseId}/exams/{examId}
Purpose: Lightweight document for listing, questions in subcollection
examId: string
sectionId: string
title: string
description: string
type: string(Reading, Listening,Speaking, Quiz)
order: number
metadata: {
  questionCount: number
  totalPoints: number
  timeLimit: number
  xpReward: number
  certificateEligible: boolean
  passingScore: number
}

settings: {
  timeLimit: number
  passingScore: number
  allowRetake: boolean
  retakeDelay: number
  maxAttempts: number
  shuffleQuestions: boolean
  shuffleOptions: boolean
  showAnswersAfter: boolean
}
createdAt: timestamp
updatedAt: timestamp
lastEditedBy: string
aiGenerated: boolean

1.4.1 courses/{courseId}/exams/{examId}/questions
Path: courses/{courseId}/exams/{examId}/questions/{questionId}
Purpose: Same structure as exercise questions
questionId: string
questionType: string ("MCQ" or "T-F-NG" or  "SHORT ANSWER")
order: number
questionText: string
options: array<{
  optionId: string (A-B-C-D for MCQ, A-B-C (or A-B) for T-F-NG)
  text: string
  isCorrect: boolean
}>(this is MCQ and T-F-NG types)
acceptedAnswers: array<string> (for short answer questions type, each answer must be less than 3 words)
explanation: string ( short explanation why the answer is like that)
(Note that for listening T-F-NG question, even though the type can be "T-F-NG" , could has 2 options only:True and False)

1.4.2 courses/{courseId}/exams/{examId}/content
Path: courses/{courseId}/exams/{examId}/content/{contentType}
Purpose: Same structure as exercise content
Document: passage
title: string
wordcount: number
thumbnail: string
text: string (html string)

Document: audio
url: string
title: string (if null, use exercise/exam title)
duration: number
transcript: {
  full: string
  timestamped: array<{
    speaker: string
    text: string
    startTime: number(second)
    endTime: number (second)
  }>
}

1.4.3 courses/{courseId}/exams/{examId}/lines
Path: courses/{courseId}/exams/{examId}/lines/{lineId}
Purpose: Speaking exam conversation lines
lineId: string
order: number
speaker: string
speakerAvatar: string (avt url,optional, if null then default to some url)
text: string
audioUrl: string (native Audio URL, always exists)
isUserLine: boolean



1.5 courses/{courseId}/reviews
Path: courses/{courseId}/reviews/{reviewId}
reviewId: string
userId: string
userName: string
userAvatar: string
rating: number
comment: string
createdAt: timestamp
helpful: number


2. users
Path: users/{userId}
userId: string
name: string
email: string
avatar: string (use uiavatars link for random avt)
role: string (student, teacher)
level: string (A1-C2)
totalXP: number
totalPoints: number
currentStreak: number
longestStreak: number
coursesEnrolled: number
lessonsCompleted: number
exercisesCompleted: number
studyTime: number
balance: number
preferences: {
  nativeLanguage: string
  learningGoals: array<string>
  dailyGoal: number
  notifications: boolean
}
createdAt: timestamp
lastActiveAt: timestamp
onlineStatus: boolean

For role: teacher (additional fields)
teacherProfile: {
  experience: string
  expertise: array<string>
  bio: string
  totalCourses: number
  totalStudents: number
  averageRating: number
  totalReviews: number
}


2.1 users/{userId}/enrollments
Path: users/{userId}/enrollments/{courseId}
courseId: string
courseTitle: string
courseThumbnail: string
enrolledAt: timestamp
status: string
completedAt: timestamp
paymentAmount: number
paymentStatus: string
progress: {
  lastAccessedAt: timestamp
  completionPercentage: number
  totalXP: number
  totalPoints: number
  lessonsCompleted: number
  exercisesCompleted: number
  examsCompleted: number
  currentLesson: string (latest unlocked lesson/exercise that the student can learn)
  currentLessonProgress: number (0-100)
}

2.1.1 users/{userId}/enrollments/{courseId}/lesson_progress
Path: users/{userId}/enrollments/{courseId}/lesson_progress/{lessonId}
lessonId: string
status: string (Completed or In Progress)
completedAt: timestamp (can be null if not completed yet)
lastAccessedAt: timestamp
progress: number (0-100)
2.1.2 users/{userId}/enrollments/{courseId}/exercise_progress
Path: users/{userId}/enrollments/{courseId}/exercise_progress/{exerciseId}
exerciseId: string
attempts: number
bestScore: number
lastScore: number
status: string
lastAttemptAt: timestamp
completedAt: timestamp
totalXPEarned: number
totalPointsEarned: number

2.1.3 users/{userId}/enrollments/{courseId}/exam_progress
Path: users/{userId}/enrollments/{courseId}/exam_progress/{examId}
examId: string
attempts: number
bestScore: number
lastScore: number
status: string
lastAttemptAt: timestamp
completedAt: timestamp
totalXPEarned: number
totalPointsEarned: number
certificateIssued: boolean
certificateUrl: string


2.2 users/{userId}/teacher_stats
Path: users/{userId}/teacher_stats/overview
Purpose: For role: teacher only, aggregated statistics for dashboard
totalCourses: number
activeCourses: number
draftCourses: number
totalStudents: number
activeStudents: number
lessonsCreated: number
exercisesCreated: number
examsCreated: number
averageCompletionRate: number
averageStudentRating: number
totalRevenue: number
monthlyRevenue: number
lastUpdated: timestamp

Monthly stats document Path: users/{userId}/teacher_stats/{year_month}
month: string
year: number
newStudents: number
courseCompletions: number
averageCompletionRate: number
totalRevenue: number
studentsActive: number
lessonsCreated: number
exercisesCreated: number
examsCreated: number


2.3 users/{userId}/student_activities(low priority.Should be reviewed if this is really necessary)
Path: users/{userId}/student_activities/{activityId}
Purpose: For teacher dashboard - track student activities in their courses
activityId: string
studentId: string
studentName: string
studentAvatar: string
courseId: string
courseName: string
activityType: string
activityDetails: object
timestamp: timestamp
read: boolean

Activity types and details:
Type: lesson_completed
activityDetails: {
  lessonId: string
  lessonTitle: string
  timeSpent: number
}

Type: exercise_completed
activityDetails: {
  exerciseId: string
  exerciseTitle: string
  score: number
}

Type: exam_completed
activityDetails: {
  examId: string
  examTitle: string
  score: number
  passed: boolean
}

Type: question_asked
activityDetails: {
  lessonId: string
  lessonTitle: string
  questionText: string
  questionId: string
}

Type: assignment_submitted
activityDetails: {
  assignmentId: string
  assignmentTitle: string
  submissionUrl: string
}

Type: course_enrolled
activityDetails: {
  enrollmentDate: timestamp
}


2.4 users/{userId}/messages(low priority.Should be reviewed if this is really necessary)
Path: users/{userId}/messages/{messageId}
Purpose: Teacher inbox for student questions and communications
messageId: string
fromUserId: string
fromUserName: string
fromUserAvatar: string
toUserId: string
courseId: string
courseName: string
subject: string
message: string
context: {
  lessonId: string
  exerciseId: string
  examId: string
}
sentAt: timestamp
read: boolean
repliedAt: timestamp
priority: string

2.5 users/{userId}/practice_exercises 
Path: users/{userId}/practice_exercises/{exerciseId}
exerciseId: string
exerciseTitle: string
completedAt: timestamp
type: string
scoreAchieved: number
maxScore: number
totalXPEarned: number
totalPointsEarned: number

2.5.1 users/{userId}/practice_exercises/{exerciseId}/answers  (user's answers for this exercise, only exists when the type="Reading", "Listening")
Path: users/{userId}/practice_exercises/{exerciseId}/answers/{questionId}

questionId: string
optionId: string (A-B-C-D, can be null if question is short answer type)
answerText: string (the user's answer content, cannot be null)
isCorrect: Boolean (is the user's answer the correct answer)

2.5.2 users/{userId}/practice_exercises/{exerciseId}/lines  (user's answers for this exercise, only exists when the type="Pronunciation")
Path: users/{userId}/practice_exercises/{exerciseId}/lines/{lineId}
Note: This collection only saves line of the user's lines, not all of the lines. To get all of the lines in the conversation, use the exerciseId to query in the pronunciation_practices collection.
lineId: string
audioUrl: string (user audio, not native audio)
duration: number
recordedAt: timestamp
assessment: {
  overallScore: number (= pronunciation score in this case)
  pronunciation: number
  accuracy: number
  fluency: number
  completeness: number
  words: array<{
    word: string
    accuracy: number
    errorType: string
  }>
 
}



2.6 users/{userId}/ai_chat_history
Path: users/{userId}/ai_chat_history/{sessionId}
Purpose: Store AI chatbot conversations for students
sessionId: string
startedAt: timestamp
lastMessageAt: timestamp
messageCount: number
status: string
title: string

2.6.1 users/{userId}/ai_chat_history/{sessionId}/messages
Path: users/{userId}/ai_chat_history/{sessionId}/messages/{messageId}
messageId: string
role: string
content: string
timestamp: timestamp
tokens: number

2.6.2 users/{userId}/ai_chat_history/{sessionId}/tagged_content
Path: users/{userId}/ai_chat_history/{sessionId}/tagged_content/{tagId}
Purpose: Content explicitly tagged by student for AI context
tagId: string
courseId: string (can be null if type == practice_exercises)
courseName: string (can be null if type == practice_exercises)
contentType: string 
contentId: string
contentTitle: string
taggedAt: timestamp
taggedInMessageId: string

Content types:
lesson
exercise
exam
reading_practice
listening_practice
pronunciation_practice

2.7 users/{userId}/ai_assistance_logs
Path: users/{userId}/ai_assistance_logs/{logId}
Purpose: For teachers - track AI assistance usage in content creation
logId: string
assistanceType: string
targetType: string
targetId: string
prompt: string
generatedContent: object
accepted: boolean
edited: boolean
editCount: number
timestamp: timestamp
model: string
tokens: number



2.9 users/{userId}/bookmarked_courses
Path: users/{userId}/bookmarked_courses/{courseId}
courseId: string
courseTitle: string 
courseThumbnail: string 
instructorName: string 
instructorAvatar: string
rating: number 
totalRatings: number 
level: string (CEFR level: A1–C2) 
totalStudents: number 
price: number 
isEnrolled: boolean (whether the user is currently enrolled in this course)

2.10 users/{userId}/course_lessons
Path: users/{userId}/course_lessons/{courseId+lessonId}
id: string (concatenation of courseId and lessonId with “_” separator)
courseId: string
lessonId: string
courseTitle: string
lessonTitle: string
lastAccessed: timestamp (timestamp when user last access the lesson)

2.11 users/{userId}/course_exercises 
Path: users/{userId}/course_exercises/{courseId+exerciseId}
id: string (concatenation of courseId and lessonId with “_” separator)
courseId: string
exerciseId: string
courseTitle: string
exerciseTitle: string
completedAt: timestamp
type: string

2.11.1 users/{userId}/course_exercises/{courseId+exerciseId}/answers  (user's answers for this exercise, only exists when the type="Reading", "Listening")
Path: users/{userId}/course_exercises/{courseId+exerciseId}/answers/{questionId}

questionId: string
optionId: string (A-B-C-D, can be null if question is short answer type)
answerText: string (the user's answer content, cannot be null)
isCorrect: Boolean (is the user's answer the correct answer)

2.11.2 users/{userId}/course_exercises/{courseId+exerciseId}/lines  (user's answers for this exercise, only exists when the type="Pronunciation")
Path: users/{userId}/course_exercises/{courseId+exerciseId}/lines/{lineId}
Note: This collection only saves line of the user's lines, not all of the lines. To get all of the lines in the conversation, use the exerciseId and courseId to query.
lineId: string
audioUrl: string (user audio, not native audio)
duration: number
recordedAt: timestamp
assessment: {
  overallScore: number (= pronunciation score in this case)
  pronunciation: number
  accuracy: number
  fluency: number
  completeness: number
  words: array<{
    word: string
    accuracy: number
    errorType: string
  }>
 
}

2.12 users/{userId}/course_exams
Path: users/{userId}/course_exams/{courseId+examId}
id: string (concatenation of courseId and lessonId with “_” separator)
courseId: string
examId: string
courseTitle: string
examTitle: string
completedAt: timestamp
type: string

2.12.1 users/{userId}/course_exams/{courseId+examId}/answers  (user's answers for this exam, only exists when the type="Reading", "Listening")
Path: users/{userId}/course_exams/{courseId+examId}/answers/{questionId}

questionId: string
optionId: string (A-B-C-D, can be null if question is short answer type)
answerText: string (the user's answer content, cannot be null)
isCorrect: Boolean (is the user's answer the correct answer)

2.12.2 users/{userId}/course_exams/{courseId+examId}/lines  (user's answers for this exam, only exists when the type="Pronunciation")
Path: users/{userId}/course_exams/{courseId+examId}/lines/{lineId}
Note: This collection only saves line of the user's lines, not all of the lines. To get all of the lines in the conversation, use the examId and courseId to query.
lineId: string
audioUrl: string (user audio, not native audio)
duration: number
recordedAt: timestamp
assessment: {
  overallScore: number (= pronunciation score in this case)
  pronunciation: number
  accuracy: number
  fluency: number
  completeness: number
  words: array<{
    word: string
    accuracy: number
    errorType: string
  }>
 
}

3. news_articles

Path:news_articles/{articleId}
(note that the articleId is not exactly the id field, it is using article_id = article.get("id", "").replace("/", "_"))
id: string
type: string
webUrl: string
apiUrl: string
webTitle: string
webPublicationDate: timestamp
sectionId: string
sectionName: string
pillarId: string
pillarName: string
newsSource: string
isHosted: boolean
cefr_level: string (CEFR level of the article text: A1–C2)
fetchedAt: timestamp
fields: {
  headline: string
  byline: string
  bylineHtml: string
  standfirst: string
  trailText: string
  thumbnail: string
  shortUrl: string
  wordcount: string
  charCount: string
  lang: string
  publication: string
  productionOffice: string
  firstPublicationDate: timestamp
  lastModified: timestamp
  isLive: string
  isPremoderated: string
  legallySensitive: string
  isInappropriateForSponsorship: string
  shouldHideAdverts: string
  shouldHideReaderRevenue: string
  showAffiliateLinks: string
  showInRelatedContent: string
}

3.1 news_articles/{articleId}/questions

Path: news_articles/{articleId}/questions/{questionId}
questionId: string
questionType: string ("MCQ" or "T-F-NG" or "SHORT ANSWER")
order: number
questionText: string
options: array<{
  optionId: string (A-B-C-D for MCQ, A-B-C for T-F-NG)
  text: string
  isCorrect: boolean
}>(this is MCQ and T-F-NG types)
acceptedAnswers: array<string> (for short answer questions type, each answer must be less than 3 words)
explanation: string ( short explanation why the answer is like that)

3.2 news_articles/{articleId}/content

Path: news_articles/{articleId}/content/article_content
body: string (full article body in HTML)
bodyText: string (full article body in plain text)
main: string (main image HTML)


4. notifications(low priority)
Path: notifications/{notificationId}
Purpose: System notifications for both students and teachers
notificationId: string
userId: string
type: string
title: string
message: string
data: object
read: boolean
createdAt: timestamp
expiresAt: timestamp
priority: string
actionUrl: string

Notification types for students:
new_lesson_available
exercise_graded
exam_available
certificate_earned
streak_milestone
course_update
Notification types for teachers:
new_student_enrolled
assignment_submitted
student_question
course_milestone
payment_received
review_received


5. pronunciation_practices
Path: pronunciation_practices/{exerciseId}
Purpose: Store pronunciation practices
exerciseId: string
title: string
thumbnail: string (thumbnail URL)
cefr: string (A1-C2)
status: string (“Not Started” or “Completed”)
createdAt: timestamp

5.1 pronunciation_practices/{exerciseId}/lines
Path: pronunciation_practices/{exerciseId}/lines/{lineId}
Purpose: Speaking exercise conversation lines
lineId: string
order: number
speaker: string
speakerAvatar: string (avt url,optional, if null then default to some url)
text: string
audioUrl: string (can be null if the user speak(speaker = name field of user))
isUserLine: boolean


6. listening_practices
Path: listening_practices/{exerciseId}
Purpose: Store listening practices
exerciseId: string
title: string
thumbnail: string (thumbnail URL)
cefr: string (A1-C2)
status: string (“Not Started” or “Completed”)
createdAt: timestamp

6.1 listening_practices/{exerciseId}/content
Path: listening_practices/{exerciseId}/content/audio
Purpose: Listening audio data
audioUrl: string
youtubeUrl: string
(can be either link: audio or youtube)
duration: number
transcript: {
  full: string
  timestamped: array<{
    speaker: string
    text: string
    startTime: number
    endTime: number
  }>
}

6.2 listening_practices/{exerciseId}/questions
Path: listening_practices/{exerciseId}/questions/{questionId}

questionId: string
questionType: string ("MCQ" or "T-F-NG" or "SHORT ANSWER")
order: number
questionText: string
options: array<{
  optionId: string (A-B-C-D for MCQ, A-B-C for T-F-NG)
  text: string
  isCorrect: boolean
}>(this is MCQ and T-F-NG types)
acceptedAnswers: array<string> (for short answer questions type, each answer must be less than 3 words)
explanation: string ( short explanation why the answer is like that)



7. leaderboards
Path: leaderboards/global
Purpose: Leaderboard, update every 5 min
lastUpdated: timestamp
topLevel: array<{
    avatar: string
    name: string
    score: number (totalXP)
    userId: string
  }>
topPoints: array<{
    avatar: string
    name: string
    score: number (totalPoints)
    userId: string
  }>
topStreak: array<{
    avatar: string
    name: string
    score: number (currentStreak)
    userId: string
  }>

8. speaking_exams
Path: speaking_exams/{examId}
Purpose: Store IELTS speaking mock exam sets
examId: string
title: string
random: number (random 32-bit integer for random selection)
createdAt: timestamp
part1: {
topic: string
questions: array<string>
}
part2: {
topic: string
prompt: string
preparationTime: number (preparation time in seconds, default: 60)
speakingTime: number (speaking time in seconds, default: 120)
}
part3: {
topic: string
questions: array<string>
}

Example exam:

{
      "id": "exam_001",
      "title": "Hometown & Local Architecture",
      "random": 1847392610,
      "part1": {
        "topic": "Hometown",
        "questions": [
          "Where are you from originally?",
          "Do you still live there now?",
          "What do you like most about your hometown?",
          "Has your hometown changed much in recent years?",
          "Would you recommend your hometown to tourists? Why or why not?"
        ]
      },
      "part2": {
        "topic": "A building you find interesting",
        "prompt": "Describe a building you find interesting. You should say:\n- where this building is\n- what it looks like\n- what it is used for\nand explain why you find this building interesting.",
        "preparation_time": 60,
        "speaking_time": 120
      },
      "part3": {
        "topic": "Architecture and Urban Development",
        "questions": [
          "How has architecture in your country changed over the past few decades?",
          "Do you think old buildings should be preserved or replaced with modern ones?",
          "How does the design of a building affect the people who use it?",
          "Should governments spend money restoring historical buildings? Why?",
          "How might cities look different in 50 years' time?"
        ]
      }
    },
