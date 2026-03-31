import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("auth/Login/Login.tsx"),
  route("signup", "auth/Login/SignUp.tsx"),
  route("dashboard", "routes/dashboard.tsx"),
  route("settings", "routes/settings.tsx"),
  route("courses/create", "routes/courseInfo.tsx"),
  route("courses/create/lessons", "routes/courseCreate.tsx"),
  route("courses/create/lessons/:lessonId/edit", "routes/LessonBuilder.tsx"),
  route("courses/create/exercises/:exerciseId/edit", "routes/ExerciseCreate.tsx"),
  route("courses/create/speaking/:exerciseId/edit", "routes/SpeakingCreate.tsx"),
  route("courses","routes/CoursesManagement.tsx")

] satisfies RouteConfig;