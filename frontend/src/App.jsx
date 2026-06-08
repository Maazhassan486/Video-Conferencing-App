import { Routes, Route } from "react-router-dom";
import HomePage from "./pages/HomePage.jsx";
import MeetingPage from "./pages/MeetingPage.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/room/:roomName" element={<MeetingPage />} />
    </Routes>
  );
}
