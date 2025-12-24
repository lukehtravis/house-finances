import { useEffect } from "react";
import { Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { Layout } from "./components/layout/Layout";
import { Rent } from "./pages/Rent";
import { RentMonth } from "./pages/RentMonth";
import { Receipts } from "./pages/Receipts";
import { HouseFinances } from "./pages/HouseFinances";
import { Admin } from "./pages/Admin";

// Component to handle GitHub Pages 404 redirect
function RedirectHandler() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    // Check if we have a query string redirect from 404.html
    const queryParams = new URLSearchParams(location.search);
    const redirectPath = queryParams.get("/");
    
    if (redirectPath) {
      // Decode the path (replace ~and~ with &)
      const decodedPath = redirectPath.replace(/~and~/g, "&");
      // Remove leading slash if present and navigate
      const cleanPath = decodedPath.startsWith("/") ? decodedPath : `/${decodedPath}`;
      navigate(cleanPath, { replace: true });
    }
  }, [location.search, navigate]);

  return null;
}

function App() {
  return (
    <Layout>
      <RedirectHandler />
      <Routes>
        <Route path="/" element={<HouseFinances />} />
        <Route path="/rent" element={<Rent />} />
        <Route path="/rent/:monthKey" element={<RentMonth />} />
        <Route path="/receipts" element={<Receipts />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </Layout>
  );
}

export default App;


