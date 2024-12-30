# Price Comparator

A web application that compares prices across different e-commerce platforms, with a focus on Monoprix products. This dashboard allows users to analyze product prices, compare categories, and process recipe ingredients.

## Features

- Product price analysis and comparison
- Recipe ingredient parsing and matching
- Interactive data visualization
- Filterable product catalog
- Brand analysis
- Price distribution charts

## Prerequisites

Before you begin, ensure you have the following installed on your computer:

- Node.js (v16 or higher) - [Download here](https://nodejs.org/)
- npm (Node Package Manager - comes with Node.js)
- Git - [Download here](https://git-scm.com/downloads)

To verify your installations, open a terminal/command prompt and run:

``` bash
node --version
npm --version
git --version
```


## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/price-comparator.git
cd price-comparator
```

2. Install dependencies for both server and client:

```bash
#Install server dependencies
cd monoprix-dashboard
npm install

#Install client dependencies
cd src
npm install
```
3. Create a `.env` file in the root directory and add your API key:

ANTHROPIC_API_KEY=your_api_key_here
PORT=3000


## Running the Application

1. Start the server:
```bash
#From the monoprix-dashboard directory
npm run server
```

2. In a new terminal, start the client:
```bash
#From the monoprix-dashboard directory
npm run dev
```

3. Open your browser and navigate to:
http://localhost:5173



## Development

- Server runs on port 3000
- Client runs on port 5173
- API endpoints:
  - `/api/parse-recipe` - Recipe parsing
  - `/api/suggest-category` - Category suggestions
  - `/api/select-product` - Product selection

## Troubleshooting

Common issues and solutions:

1. **Port already in use**
   ```bash
   # Kill the process using the port
   npx kill-port 3000
   npx kill-port 5173
   ```

2. **Module not found errors**
   ```bash
   # Clear npm cache and reinstall
   npm cache clean --force
   npm install
   ```

3. **Node version issues**
   ```bash
   # Install nvm (Node Version Manager)
   # On Windows: https://github.com/coreybutler/nvm-windows
   # On Mac/Linux:
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
   
   # Use correct Node version
   nvm install 16
   nvm use 16
   ```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.