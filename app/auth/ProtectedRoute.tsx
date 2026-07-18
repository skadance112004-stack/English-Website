// app/auth/ProtectedRoute.tsx
import { Navigate, Outlet } from "react-router";
import { useAuth } from "./AuthContext";

export default function ProtectedRoute({ children }: { children?: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
        <div style={{ fontSize: "14px", color: "#6b7280" }}>Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}

// -----------------------------------------------------------
// Example routes.ts setup (add to your existing routes file):
// -----------------------------------------------------------
//
// import Login from "./auth/Login/Login";
// import SignUp from "./auth/Login/SignUp";
// import ProtectedRoute from "./auth/ProtectedRoute";
//
// export const routes = [
//   { path: "/login",  element: <Login /> },
//   { path: "/signup", element: <SignUp /> },
//   {
//     path: "/dashboard",
//     element: (
//       <ProtectedRoute>
//         <Dashboard />
//       </ProtectedRoute>
//     ),
//   },
//   { path: "/", element: <Navigate to="/login" replace /> },
// ];
//
// -----------------------------------------------------------
// root.tsx — wrap <RouterProvider> with <AuthProvider>:
// -----------------------------------------------------------
//
// import { AuthProvider } from "./auth/AuthContext";
//
// export default function Root() {
//   return (
//     <AuthProvider>
//       <RouterProvider router={router} />
//     </AuthProvider>
//   );
// }