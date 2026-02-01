# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AFE Plus (Elderly Assistance System) is a Next.js TypeScript application for monitoring and managing care for elderly people. The system tracks location, vital signs (heart rate, temperature), fall detection, and manages equipment borrowing. It integrates with LINE messaging platform for notifications and uses PostgreSQL with Prisma ORM.

## Development Commands

```bash
# Install dependencies
npm install

# Development server (runs on port 3050)
npm run dev

# Production build
npm run build

# Start production server
npm start

# Linting
npm run lint

# Prisma commands
npx prisma generate          # Generate Prisma Client
npx prisma migrate dev       # Run migrations in development
npx prisma db push          # Push schema changes without migrations
npx prisma studio           # Open Prisma Studio to view/edit data
```

## Database Setup

The application uses PostgreSQL. Database configuration:
- Database name: `sepawv2`
- Connection strings are defined in environment variables:
  - `DATABASE_PUBLIC_URL` - Main connection URL
  - `DATABASE_PUBLIC_URL_NON_POOLING` - Direct connection URL

Required master data tables need to be populated:
- `status` - User roles (1: Caregiver, 2: Local Admin, 3: System Admin)
- `gender` - Gender types
- `marrystatus` - Marital status types

## Architecture

### Hybrid Routing Structure

The project uses both Next.js routing approaches:
- **Pages Router** (`src/pages/`) - Primary routing for the application
- **App Router** (`src/app/`) - Minimal usage, mostly entry point

### Key Directories

- `src/pages/` - Page components and API routes
  - `src/pages/api/` - API endpoints organized by feature
  - `src/pages/admin/` - Admin dashboard pages
  - `src/pages/userinfo/` - User information pages
  - `src/pages/borrowequipment/` - Equipment borrowing pages
- `src/components/` - Reusable UI components (Button, Form, Modals, etc.)
- `src/lib/` - Core utilities and configurations
  - `prisma.ts` - Prisma client singleton
  - `authMiddleware.ts` - JWT authentication logic
  - `lineFunction.ts` - LINE messaging integration
  - `service/` - Business logic services
- `src/redux/` - Redux store and state management
- `src/types/` - TypeScript type definitions
- `src/context/` - React context providers
- `src/utils/` - Utility functions
- `prisma/` - Database schema and migrations

### Authentication & Authorization

- Uses JWT tokens stored in cookies (`currentUser`)
- Middleware checks authentication (currently commented out in `middleware.ts`)
- Auth service in `src/lib/service/auth.ts`
- User roles determined by `status_id` field:
  - 1: Caregiver (ผู้ดูแลผู้สูงอายุ)
  - 2: Local Admin (เจ้าหน้าที่ อบต.)
  - 3: System Admin

### Data Flow

1. **Monitoring Data Flow**: IoT devices/smartwatches → API endpoints (`sentlocation.ts`, `sentHeartRate.ts`, `sentTemperature.ts`, `sentFall.ts`) → Database → LINE notifications
2. **Admin Management**: Admin pages → API routes under `api/admin/` → Services → Prisma → Database
3. **Equipment Borrowing**: Borrow forms → `api/borrowequipment/` → Multi-step approval workflow → Status tracking

### Key Database Models

- `users` - Caregivers and admins (has authentication)
- `takecareperson` - Elderly people being cared for (linked to users)
- `location` - GPS tracking records
- `heartrate_records` & `heartrate_settings` - Heart rate monitoring
- `temperature_records` & `temperature_settings` - Temperature monitoring
- `fall_records` - Fall detection events
- `borrowequipment` & `borrowequipment_list` - Equipment borrowing system
- `safezone` - Geofencing for location alerts

### API Route Organization

API routes follow feature-based organization:
- `/api/auth/` - Authentication (login, session management)
- `/api/admin/` - Admin operations (user management, equipment approval)
- `/api/borrowequipment/` - Equipment borrowing CRUD
- `/api/location/` - Location data endpoints
- `/api/registration/` - User and elderly registration
- `/api/setting/` - System settings and thresholds
- `/api/user/` - User profile operations
- Top-level APIs: `sentlocation.ts`, `sentHeartRate.ts`, `sentTemperature.ts`, `sentFall.ts` - IoT device data ingestion

### LINE Integration

LINE messaging is used for notifications:
- Configuration in `src/lib/lineFunction.ts`
- Access token stored in `CHANNEL_ACCESS_TOKEN_LINE` environment variable
- Webhook handler at `api/webhook.ts`
- Sends alerts for:
  - Low battery warnings
  - Out-of-safezone alerts
  - Fall detection
  - Abnormal vital signs

### Environment Variables

Required in `.env` files:
- `DATABASE_PUBLIC_URL` - PostgreSQL connection string
- `DATABASE_PUBLIC_URL_NON_POOLING` - Direct PostgreSQL connection
- `GOOGLE_MAPS_API_KEY` - For location features
- `CHANNEL_ACCESS_TOKEN_LINE` - LINE messaging API token
- `WEB_API_URL` - Backend API URL
- `WEB_DOMAIN` - Frontend domain
- `CRYPTOJS_SECRET_KEY` - Encryption key
- `SECRET_KEY` - JWT secret key
- `APP_STATUS` - Environment (DEV/PROD)

### Styling

- Tailwind CSS for utility classes (`tailwind.config.js`)
- Custom SCSS in `src/styles/`
- Bootstrap components via `react-bootstrap`

## Important Patterns

### Prisma Client Usage

Always import the singleton instance:
```typescript
import prisma from '@/lib/prisma';
```

### API Route Structure

API routes follow this pattern:
```typescript
import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === 'POST') {
    // Handle POST
  } else {
    res.status(405).json({ message: 'Method not allowed' });
  }
}
```

### Path Aliases

The project uses `@/` alias for imports:
- `@/lib/prisma` → `src/lib/prisma.ts`
- `@/types/user` → `src/types/user.ts`
- `@/components/Button` → `src/components/Button`

## Common Workflows

### Adding a New API Endpoint

1. Create file in appropriate `src/pages/api/[feature]/` directory
2. Import Prisma client and types
3. Implement request handler with proper HTTP method checking
4. Add validation using Zod if needed
5. Add corresponding service function in `src/lib/service/` if complex logic

### Adding a New Page

1. Create file in `src/pages/[feature]/` or `src/pages/admin/`
2. Use `withCommonData` HOC for pages needing authentication context
3. Import layout component from `src/components/LayoutPage`
4. Follow existing page patterns for consistency

### Database Schema Changes

1. Modify `prisma/schema.prisma`
2. Run `npx prisma migrate dev --name description_of_change`
3. Run `npx prisma generate` to update Prisma Client
4. Update TypeScript types in `src/types/` if needed

## Testing the Application

No automated test framework is currently configured. Manual testing workflow:
1. Start development server on port 3050
2. Test authentication flows through `/admin/login`
3. Verify database connections through Prisma Studio
4. Test LINE notifications using webhook endpoint
