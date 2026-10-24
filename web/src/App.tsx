import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "./lib/auth";
import Login from "./pages/Login";
import ProjectList from "./pages/ProjectList";
import ProjectView from "./pages/ProjectView";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth />}>
        <Route path="/" element={<ProjectList />} />
        <Route path="/projects/:projectId" element={<ProjectView />} />
        <Route path="/projects/:projectId/:docType" element={<ProjectView />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
