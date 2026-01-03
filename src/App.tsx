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
    // The 404.html script creates URLs like: /house-finances/?/admin
    // The format is ?/path, which is not a standard query string
    // We need to manually parse it
    const search = location.search;
    
    if (search.startsWith("?/")) {
      // Extract the path after ?/
      let redirectPath = search.slice(2); // Remove "?/"
      
      // Handle query parameters and hash if present
      // The 404.html script encodes & as ~and~ in the path part
      // But if there are actual query params, they come after &
      const queryParamIndex = redirectPath.indexOf("&");
      if (queryParamIndex !== -1) {
        // Check if this is a real query param (has =) or just ~and~ encoding
        const afterAmpersand = redirectPath.slice(queryParamIndex + 1);
        if (afterAmpersand.includes("=")) {
          // This is a real query parameter, so everything before it is the path
          redirectPath = redirectPath.slice(0, queryParamIndex);
        }
      }
      
      // Decode the path (replace ~and~ with &)
      const decodedPath = redirectPath.replace(/~and~/g, "&");
      
      // Ensure the path starts with /
      let cleanPath = decodedPath.startsWith("/") ? decodedPath : `/${decodedPath}`;
      
      // Remove the base path if it's duplicated (shouldn't happen, but just in case)
      cleanPath = cleanPath.replace(/^\/house-finances/, "");
      
      // Ensure it starts with /
      if (!cleanPath.startsWith("/")) {
        cleanPath = `/${cleanPath}`;
      }
      
      navigate(cleanPath, { replace: true });
    } else {
      // Also try the standard query parameter approach as fallback
      const queryParams = new URLSearchParams(search);
      const redirectPath = queryParams.get("/");
      
      if (redirectPath) {
        const decodedPath = redirectPath.replace(/~and~/g, "&");
        let cleanPath = decodedPath.startsWith("/") ? decodedPath : `/${decodedPath}`;
        cleanPath = cleanPath.replace(/^\/house-finances/, "");
        if (!cleanPath.startsWith("/")) {
          cleanPath = `/${cleanPath}`;
        }
        navigate(cleanPath, { replace: true });
      }
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


