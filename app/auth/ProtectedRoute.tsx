// app/auth/ProtectedRoute.tsx
import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router";
import { useAuth } from "./AuthContext";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase/firebase";

export default function ProtectedRoute({ children }: { children?: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [role, setRole] = useState<string | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setRoleLoading(false);
      return;
    }
    const checkRole = async () => {
      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          setRole(userDoc.data().role || null);
        }
      } catch (err) {
        console.error("Error fetching user role", err);
      } finally {
        setRoleLoading(false);
      }
    };
    checkRole();
  }, [user]);

  if (authLoading || roleLoading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
        <div style={{ fontSize: "14px", color: "#6b7280" }}>Loading...</div>
      </div>
    );
  }

  if (!user || role !== "teacher") {
    // Redirect unauthenticated or non-teacher users
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