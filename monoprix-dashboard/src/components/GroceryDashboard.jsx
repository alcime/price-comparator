import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ArrowUpDown } from "lucide-react";
import RecipeAnalyzer from '@/components/recipe-analyzer/RecipeAnalyzer';

const GroceryDashboard = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedMainCategory, setSelectedMainCategory] = useState('all');
  const [selectedSubcategory, setSelectedSubcategory] = useState('all');
  const [availableSubcategories, setAvailableSubcategories] = useState([]);
  const [productSearch, setProductSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const productsPerPage = 10;
  const [searchError, setSearchError] = useState(null);
  const [products, setProducts] = useState([]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await fetch('/products_v2_curated_deduplicated_change_cat_names.csv');
        const text = await response.text();
        
        Papa.parse(text, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          transform: (value, field) => {
            if (value === '') return null;
            if (field === 'categoryPath' && typeof value === 'string') {
              try {
                return JSON.parse(value.replace(/'/g, '"'));
              } catch {
                return [];
              }
            }
            if (value === 'True') return true;
            if (value === 'False') return false;
            return value;
          },
          complete: (results) => {
            setData(results.data);
            setLoading(false);
          },
          error: (error) => {
            setError('Error parsing CSV: ' + error.message);
            setLoading(false);
          }
        });
      } catch (error) {
        setError('Error loading data: ' + error.message);
        setLoading(false);
      }
    };

    loadData();
  }, []);

  useEffect(() => {
    if (selectedMainCategory === 'all') {
      const allSubcategories = new Set();
      data.forEach(item => {
        if (Array.isArray(item.categoryPath)) {
          item.categoryPath.forEach(cat => allSubcategories.add(cat));
        }
      });
      setAvailableSubcategories(Array.from(allSubcategories).sort());
    } else {
      const subcategories = new Set();
      data.forEach(item => {
        if (item.main_category === selectedMainCategory && Array.isArray(item.categoryPath)) {
          item.categoryPath.forEach(cat => subcategories.add(cat));
        }
      });
      setAvailableSubcategories(Array.from(subcategories).sort());
    }
    setSelectedSubcategory('all');
    setCurrentPage(1); // Reset to first page when changing categories
  }, [selectedMainCategory, data])
  ;
  const handleSearch = (e) => {
    try {
      setProductSearch(e.target.value);
    } catch (error) {
      setSearchError('Error updating search');
      console.error('Search error:', error);
    }
  };
  
  const analytics = React.useMemo(() => {
    if (!data.length) return null;

    const mainCategories = Array.from(new Set(data.map(item => item.main_category))).sort();

    const filteredData = data.filter(item => {
      const mainCategoryMatch = selectedMainCategory === 'all' || item.main_category === selectedMainCategory;
      const subcategoryMatch = selectedSubcategory === 'all' || 
        (Array.isArray(item.categoryPath) && item.categoryPath.includes(selectedSubcategory));
      return mainCategoryMatch && subcategoryMatch;
    });

    const categoryAnalysis = filteredData.reduce((acc, item) => {
      const category = item.main_category;
      if (!acc[category]) {
        acc[category] = {
          name: category,
          count: 0,
          totalPrice: 0,
          prices: [],
          avgPricePerKg: 0,
          pricesPerKg: []
        };
      }
      acc[category].count++;
      if (item.price_eur) {
        acc[category].totalPrice += item.price_eur;
        acc[category].prices.push(item.price_eur);
      }
      if (item.price_per_kg_eur) {
        acc[category].pricesPerKg.push(item.price_per_kg_eur);
      }
      return acc;
    }, {});

    const brandCounts = filteredData.reduce((acc, item) => {
      if (item.brand) {
        acc[item.brand] = (acc[item.brand] || 0) + 1;
      }
      return acc;
    }, {});

    const topBrands = Object.entries(brandCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const priceRanges = filteredData.reduce((acc, item) => {
      if (!item.price_eur) return acc;
      const range = Math.floor(item.price_eur / 5) * 5;
      const key = `${range}-${range + 5}€`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const priceDistribution = Object.entries(priceRanges)
      .map(([range, count]) => ({ range, count }))
      .sort((a, b) => parseInt(a.range) - parseInt(b.range));

    return {
      mainCategories,
      categoryStats: Object.values(categoryAnalysis),
      topBrands,
      priceDistribution,
      totalProducts: filteredData.length,
      availableProducts: filteredData.filter(item => item.available).length,
      averagePrice: filteredData.length ? 
        (filteredData.reduce((sum, item) => sum + (item.price_eur || 0), 0) / filteredData.length).toFixed(2) : 0
    };
  }, [data, selectedMainCategory, selectedSubcategory]);

  const filteredAndSortedProducts = React.useMemo(() => {
    try {
      if (!data.length) return [];
  
      let products = data.filter(item => {
        if (!item) return false;
        
        const mainCategoryMatch = selectedMainCategory === 'all' || item.main_category === selectedMainCategory;
        const subcategoryMatch = selectedSubcategory === 'all' || 
          (Array.isArray(item.categoryPath) && item.categoryPath.includes(selectedSubcategory));
        
        // Early return if no search term
        const searchTerm = (productSearch || '').trim().toLowerCase();
        if (!searchTerm) return mainCategoryMatch && subcategoryMatch;
  
        // Strict type checking for name and brand
        const nameMatch = typeof item.name === 'string' ? 
          item.name.toLowerCase().includes(searchTerm) : false;
        
        const brandMatch = typeof item.brand === 'string' ? 
          item.brand.toLowerCase().includes(searchTerm) : false;
        
        return mainCategoryMatch && subcategoryMatch && (nameMatch || brandMatch);
      });
  

    if (sortConfig.key) {
        products.sort((a, b) => {
          let aValue = a[sortConfig.key];
          let bValue = b[sortConfig.key];
          
          // Handle null/undefined values
          if (aValue == null) return sortConfig.direction === 'asc' ? -1 : 1;
          if (bValue == null) return sortConfig.direction === 'asc' ? 1 : -1;
          
          // Convert to numbers for numerical columns
          if (['price_eur', 'price_per_kg_eur', 'size_value'].includes(sortConfig.key)) {
            aValue = Number(aValue);
            bValue = Number(bValue);
          }
          
          // String comparison for text columns
          if (typeof aValue === 'string') {
            aValue = aValue.toLowerCase();
            bValue = bValue.toLowerCase();
          }
          
          if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
          if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
          return 0;
        });
      }

    return products;
} catch (error) {
    console.error('Filtering error:', error);
    // Log additional debug information
    if (error instanceof TypeError) {
      console.debug('Data sample:', data.slice(0, 5));
    }
    return [];
  }
}, [data, selectedMainCategory, selectedSubcategory, productSearch, sortConfig]);

  const currentProducts = filteredAndSortedProducts.slice(
    (currentPage - 1) * productsPerPage,
    currentPage * productsPerPage
  );

  const totalPages = Math.ceil(filteredAndSortedProducts.length / productsPerPage);

  const handleSort = (key) => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  };
  

  if (loading) return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  if (error) return <div className="text-red-500 p-4">{error}</div>;
  if (!analytics) return null;

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Monoprix Product Analysis</h1>

        <div className="mb-6">
          <RecipeAnalyzer products={data} />
        </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>Main Category Filter</CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={selectedMainCategory} onValueChange={setSelectedMainCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Select main category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {analytics.mainCategories.map(category => (
                  <SelectItem key={category} value={category}>{category}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Subcategory Filter</CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={selectedSubcategory} onValueChange={setSelectedSubcategory}>
              <SelectTrigger>
                <SelectValue placeholder="Select subcategory" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Subcategories</SelectItem>
                {availableSubcategories.map(category => (
                  <SelectItem key={category} value={category}>{category}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>Products</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{analytics.totalProducts}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Available</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{analytics.availableProducts}</p>
            <p className="text-sm text-gray-500">
              ({((analytics.availableProducts / analytics.totalProducts) * 100).toFixed(1)}%)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Average Price</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">€{analytics.averagePrice}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>Price Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.priceDistribution}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="range" angle={-45} textAnchor="end" height={100} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="count" fill="#8884d8" name="Number of Products" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Brands</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.topBrands} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={150} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="count" fill="#82ca9d" name="Number of Products" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Product Details</CardTitle>
          <div className="flex items-center space-x-2">
          <Input
  placeholder="Search products or brands..."
  value={productSearch}
  onChange={handleSearch}
  className="max-w-sm"
/>
{searchError && (
  <p className="text-red-500 text-sm mt-1">{searchError}</p>
)}
            <p className="text-sm text-gray-500">
              Showing {filteredAndSortedProducts.length} products
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[300px]">
                    <Button variant="ghost" onClick={() => handleSort('name')}>
                      Product Name <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button variant="ghost" onClick={() => handleSort('brand')}>
                      Brand <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                  </TableHead>
                  <TableHead className="text-right">
                    <Button variant="ghost" onClick={() => handleSort('price_eur')}>
                      Price (€) <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                  </TableHead>
                  <TableHead className="text-right">
                    <Button variant="ghost" onClick={() => handleSort('price_per_kg_eur')}>
                      Price/kg (€) <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                  </TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentProducts.map((product) => (
                  <TableRow key={product.productId}>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell>{product.brand || '-'}</TableCell>
                    <TableCell className="text-right">
                      {product.price_eur?.toFixed(2) || '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      {product.price_per_kg_eur?.toFixed(2) || '-'}
                      </TableCell>
                    <TableCell>{product.size_value || '-'}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        product.available ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {product.available ? 'Available' : 'Unavailable'}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          
          <div className="flex items-center justify-between space-x-2 py-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4 mr-2" />
              Previous
            </Button>
            <span className="text-sm text-gray-600">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default GroceryDashboard;