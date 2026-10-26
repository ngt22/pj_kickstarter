import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAdmin, RequireAuth } from "./lib/auth";
import Admin from "./pages/Admin";
import CliLogin from "./pages/CliLogin";
import Login from "./pages/Login";
import ProjectList from "./pages/ProjectList";
import ProjectPrint from "./pages/ProjectPrint";
import ProjectView from "./pages/ProjectView";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth />}>
        <Route path="/" element={<ProjectList />} />
        <Route path="/projects/:projectId" element={<ProjectView />} />
        <Route path="/projects/:projectId/print" element={<ProjectPrint />} />
        <Route path="/projects/:projectId/:docType" element={<ProjectView />} />
        <Route element={<RequireAdmin />}>
          <Route path="/admin" element={<Admin />} />
          <Route path="/cli-login" element={<CliLogin />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
