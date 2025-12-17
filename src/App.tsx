import { Routes, Route } from "react-router-dom";
import { Layout } from "./components/layout/Layout";
import { Home } from "./pages/Home";
import { Rent } from "./pages/Rent";
import { RentMonth } from "./pages/RentMonth";
import { Receipts } from "./pages/Receipts";
import { HouseFinances } from "./pages/HouseFinances";
import { Admin } from "./pages/Admin";

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/rent" element={<Rent />} />
        <Route path="/rent/:monthKey" element={<RentMonth />} />
        <Route path="/receipts" element={<Receipts />} />
        <Route path="/house-finances" element={<HouseFinances />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </Layout>
  );
}

export default App;


