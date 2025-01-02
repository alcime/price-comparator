// App.jsx
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import GroceryDashboard from './components/GroceryDashboard';
import RecipePage from './components/RecipePage';

function App() {
  return (
    <BrowserRouter>
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex space-x-8">
              <Link 
                to="/" 
                className="inline-flex items-center px-1 pt-1 text-gray-900 hover:text-blue-600"
              >
                Dashboard
              </Link>
              <Link 
                to="/recipe" 
                className="inline-flex items-center px-1 pt-1 text-gray-900 hover:text-blue-600"
              >
                Recipe Calculator
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <Routes>
        <Route path="/" element={<GroceryDashboard />} />
        <Route path="/recipe" element={<RecipePage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;