# Savoney

Savoney is a full-stack expense tracking application for managing personal finances. It includes a modern React dashboard for tracking transactions, categories, budgets, and analytics, backed by a Node.js and Express API with MongoDB authentication and data storage.

## What It Does

- User authentication with register, login, session restore, and logout
- Transaction tracking for income and expenses
- Category management to organize spending
- Budget management to monitor limits and progress
- Analytics views for financial summaries and trends
- Protected routes and token-based API access

## Tech Stack

- Frontend: React 19, Vite, React Router, Axios, Recharts, React Hot Toast
- Backend: Node.js, Express, MongoDB, Mongoose, JWT, bcryptjs
- Tooling: ESLint, Nodemon, Vite dev server

## Project Structure

- `client/` - React frontend application
- `server/` - Express API and MongoDB models
- `legacy/` - Older static prototype assets

## Getting Started

### Prerequisites

- Node.js 18+ recommended
- MongoDB connection string

### 1. Set up the backend

```bash
cd server
npm install
```

Create a `.env` file in `server/` with:

```env
PORT=5000
CLIENT_URL=http://localhost:5173
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_secret_key
NODE_ENV=development
```

Start the API:

```bash
npm run dev
```

### 2. Set up the frontend

```bash
cd ../client
npm install
```

Optionally create a `.env` file in `client/` if you want to override the API URL:

```env
VITE_API_URL=http://localhost:5000/api
```

Start the UI:

```bash
npm run dev
```

## Available Scripts

### Client

- `npm run dev` - Start the Vite development server
- `npm run build` - Build the frontend for production
- `npm run lint` - Run ESLint
- `npm run preview` - Preview the production build

### Server

- `npm run dev` - Start the API with Nodemon
- `npm start` - Start the API with Node.js

## API Overview

The backend exposes routes for:

- Authentication: `/api/auth`
- Transactions: `/api/transactions`
- Categories: `/api/categories`
- Budgets: `/api/budgets`
- Analytics: `/api/analytics`

The API also includes a health check at `/api/health`.

## Frontend Pages

- Dashboard
- Transactions
- Categories
- Budgets
- Analytics
- Authentication

## Notes

- The frontend stores the auth token in `localStorage` under `savoney_token`.
- The client expects the API to be available at `http://localhost:5000/api` unless `VITE_API_URL` is set.
- The server enables CORS for the configured client origin.