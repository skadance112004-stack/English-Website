import { type RouteConfig, index, route, layout } from "@react-router/dev/routes";

export default [
  index("auth/Login/Login.tsx"),
  route("signup", "auth/Login/SignUp.tsx"),
  route("forgot-password", "auth/Login/ForgotPassword.tsx"),
  
  layout("auth/ProtectedRoute.tsx", [
    route("dashboard", "routes/dashboard.tsx"),
    route("settings", "routes/settings.tsx"),
    route("courses/create", "routes/courseInfo.tsx"),
    route("courses/create/lessons", "routes/courseCreate.tsx"),
    route("courses/:courseId/lessons/:lessonId/edit", "routes/LessonBuilder.tsx"),
    route("courses/:courseId/exercises/:exerciseId/edit", "routes/ExerciseCreate.tsx"),
    route("courses/:courseId/speaking/:exerciseId/edit", "routes/SpeakingCreate.tsx"),
    route("courses","routes/CoursesManagement.tsx")
  ])
] satisfies RouteConfig;