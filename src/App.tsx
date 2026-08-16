import { Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { HomePage } from './pages/HomePage';
import { BracketPage } from './pages/BracketPage';
import { CreateContestPage } from './pages/CreateContestPage';
import { HostPage } from './pages/HostPage';
import { VotePage } from './pages/VotePage';
import './App.css';

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/contest/new" element={<CreateContestPage />} />
        <Route path="/contest/:slug" element={<HostPage />} />
        <Route path="/vote/:slug" element={<VotePage />} />
      </Route>
      <Route path="/bracket" element={<BracketPage />} />
    </Routes>
  );
}
