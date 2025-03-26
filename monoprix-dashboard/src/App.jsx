// App.jsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import GroceryDashboard from './components/GroceryDashboard';
import RecipePage from './components/RecipePage';
import './styles/globals.css'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RecipePage />} />
        <Route path="/admin-dashboard" element={<GroceryDashboard />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;