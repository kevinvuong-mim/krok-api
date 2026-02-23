# Mimkat API

Backend API for Mimkat application built with NestJS, PostgreSQL, and Prisma ORM.

## 📋 Table of Contents

- [Tech Stack](#-tech-stack)
- [Prerequisites](#-prerequisites)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Running the App](#-running-the-app)
- [Scripts](#-scripts)
- [Project Structure](#-project-structure)
- [Testing](#-testing)
- [Deployment](#-deployment)

## 🛠 Tech Stack

### Core

- **[NestJS](https://nestjs.com/)** - Framework Node.js progressive
- **[TypeScript](https://www.typescriptlang.org/)** - Strongly typed programming language
- **[Node.js](https://nodejs.org/)** - JavaScript runtime (v20+)

### Database

- **[PostgreSQL](https://www.postgresql.org/)** - Relational database
- **[Prisma](https://www.prisma.io/)** - Next-generation ORM

### Authentication

- **[Passport](http://www.passportjs.org/)** - Authentication middleware
- **[JWT](https://jwt.io/)** - JSON Web Token
- **[Google OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)** - Social login

### Storage & Media

- **[AWS S3](https://aws.amazon.com/s3/)** - Cloud storage
- **[Sharp](https://sharp.pixelplumbing.com/)** - High performance image processing

### Email

- **[Nodemailer](https://nodemailer.com/)** - Email sending library

### Security & Utilities

- **[Helmet](https://helmetjs.github.io/)** - Security headers
- **[bcrypt](https://github.com/kelektiv/node.bcrypt.js)** - Password hashing
- **[class-validator](https://github.com/typestack/class-validator)** - Validation decorators
- **[class-transformer](https://github.com/typestack/class-transformer)** - Object transformation

## 📦 Prerequisites

- **Node.js** >= 20.0.0
- **Docker** for containerized database
- **npm** or **yarn** or **pnpm**
- **AWS Account** (for S3 storage)
- **Google OAuth Credentials** (for Google login)
- **SMTP Server** (for email service)

## 🚀 Installation

### 1. Clone repository

```bash
git clone https://github.com/kevinvuong-mim/mimkat-api.git
cd mimkat-api
```

### 2. Install dependencies

```bash
npm install
# or
yarn install
# or
pnpm install
```

### 3. Create .env file

```bash
cp .env.example .env
```

### 4. Setup database

Start PostgreSQL database with Docker Compose:

```bash
docker-compose up -d
```

This will start:

- Password: `1234abcd`
- Username: `kwong2000`
- Database name: `mimkat`
- PostgreSQL on port `5432`

### 5. Run migrations

```bash
npm run prisma:migrate
# or
npx prisma migrate dev
```

### 6. Generate Prisma Client

```bash
npm run prisma:generate
# or
npx prisma generate
```

## ⚙️ Configuration

Create a `.env` file in the root directory with the following environment variables:

```env
# Database
DATABASE_URL="postgresql://kwong2000:1234abcd@localhost:5432/mimkat"

# JWT
JWT_SECRET="your-jwt-secret-key-at-least-32-chars"
JWT_REFRESH_SECRET="your-jwt-refresh-secret-key-at-least-32-chars"

# Google OAuth
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
GOOGLE_CALLBACK_URL="http://localhost:3000/auth/google/callback"

# Email
MAIL_PORT=587
MAIL_HOST="smtp.gmail.com"
MAIL_FROM="noreply@mimkat.com"
MAIL_USER="your-email@gmail.com"
MAIL_PASSWORD="your-app-password"

# CORS
CORS_ORIGIN="http://localhost:3001, http://localhost:3002"

# Server
PORT=3000
NODE_ENV="development"

# AWS S3 Configuration
AWS_REGION="ap-southeast-1"
AWS_BUCKET_NAME="mimkat-storage"
AWS_ACCESS_KEY_ID="your-access-key"
AWS_ENDPOINT="https://oss.s3.mimkat.vn"
AWS_SECRET_ACCESS_KEY="your-secret-key"
```

📘 **For detailed instructions on obtaining environment variables**: See [Environment Variables Guide](./documents/setup/environment-variables.md)

## 🏃 Running the App

### Development mode

```bash
npm run start:dev
```

Server will run at `http://localhost:3000`

### Production mode

```bash
# Build
npm run build

# Start
npm run start:prod
```

### Debug mode

```bash
npm run start:debug
```

## 📜 Scripts

```bash
# Development
npm run start          # Start the application
npm run start:dev      # Start with watch mode
npm run start:debug    # Start with debug mode

# Build
npm run build          # Build for production

# Production
npm run start:prod     # Run production build

# Code Quality
npm run format         # Format code with Prettier
npm run lint           # Lint code with ESLint

# Testing
npm run test           # Run unit tests
npm run test:watch     # Run tests in watch mode
npm run test:cov       # Run tests with coverage
npm run test:e2e       # Run end-to-end tests

# Database
npm run prisma:generate  # Generate Prisma Client
npm run prisma:migrate   # Run migrations
npx prisma studio        # Open Prisma Studio (database GUI)

# Docker
docker-compose up -d     # Start database in background
docker-compose down      # Stop database
```

## 📁 Project Structure

```
mimkat-api/
├── documents/             # Project documentation
│   ├── apis/              # API documentation
│   │   ├── auth/          # Auth endpoints docs
│   │   ├── users/         # User endpoints docs
│   │   └── verification/  # Verification endpoints docs
│   ├── modules/           # Module documentation
│   └── setup/             # Setup guides
├── prisma/
│   ├── schema.prisma      # Database schema
│   └── migrations/        # Database migrations
├── src/
│   ├── auth/              # Authentication module
│   │   ├── guards/        # Auth guards (JWT, Google)
│   │   ├── strategies/    # Passport strategies
│   │   └── dto/           # Auth DTOs
│   ├── users/             # User management module
│   │   └── dto/           # User DTOs
│   ├── verification/      # Email verification & password reset
│   │   └── dto/           # Verification DTOs
│   ├── mail/              # Email service
│   ├── storage/           # File storage (S3)
│   │   └── providers/     # Storage providers
│   ├── image-processing/  # Image optimization
│   ├── prisma/            # Prisma service
│   ├── tasks/             # Background tasks
│   ├── common/            # Shared utilities
│   │   ├── decorators/    # Custom decorators
│   │   ├── filters/       # Exception filters
│   │   ├── interceptors/  # Response interceptors
│   │   ├── interfaces/    # Shared interfaces
│   │   ├── utils/         # Utility functions
│   │   └── validators/    # Validators
│   ├── app.module.ts      # Root module
│   └── main.ts            # Application entry point
├── test/                  # Test files
├── .env                   # Environment variables
├── .env.example           # Environment template
└── package.json           # Dependencies
```

## 🧪 Testing

```bash
# Unit tests
npm run test

# Watch mode
npm run test:watch

# Test coverage
npm run test:cov

# E2E tests
npm run test:e2e
```

## 🚀 Deployment

### 1. Build the application

```bash
npm run build
```

### 2. Set environment variables

Ensure all production environment variables are properly configured:

- `NODE_ENV=production`
- Production database URL
- JWT secrets (different from development)
- AWS credentials
- SMTP credentials
- CORS_ORIGIN (production frontend URL)

### 3. Run migrations

```bash
npx prisma migrate deploy
```

### 4. Start application

```bash
npm run start:prod
```
