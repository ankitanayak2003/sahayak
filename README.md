# Sahayak — Backend

> **AI-Assisted Emergency & Community Assistance Backend**

Sahayak is a backend system designed to connect citizens requiring assistance with verified volunteers and police administrators through a secure, role-based API.

The backend provides authentication, authorization, volunteer management, assistance-request lifecycle management, emergency escalation, DTMF/keypad-based interaction, notifications, audit history, and protected handling of sensitive user information.

The system is designed with accessibility in mind so that assistance workflows can eventually be accessed not only through smartphone applications but also through conventional cellular calls using keypad/DTMF input.

---

## 🎥 Technical Demo

**Backend Implementation & Demo:**

[Watch the Sahayak Backend Demo on YouTube](https://youtu.be/v4KY03LIqCU?utm_source=chatgpt.com)

The demonstration covers the implemented backend functionality, including:

* Backend architecture
* MongoDB database integration
* Volunteer registration
* OTP-based registration verification
* Password hashing
* JWT authentication
* Role-based authorization
* Assistance request creation
* Request assignment
* Volunteer acceptance
* Request status management
* Emergency escalation
* Police-admin emergency management
* DTMF/keypad interaction
* API testing using Postman
* Security mechanisms for sensitive data

---

# 1. Problem

Traditional assistance systems can become difficult to use when the user:

* Does not have a smartphone
* Has limited internet access
* Is not comfortable with complex applications
* Requires immediate emergency assistance
* Needs to communicate using a basic/button phone

Sahayak addresses this by providing a backend that supports multiple interaction channels while maintaining centralized authentication, authorization, request management, and emergency escalation.

The backend acts as the central coordination layer between:

```text
Citizen / Caller
       |
       v
Interaction Layer
(App / DTMF / Future Voice Provider)
       |
       v
Sahayak Backend
       |
       +--------------------+
       |                    |
       v                    v
   MongoDB              Decision Layer
       |                    |
       v                    v
Volunteers <---------- Police Admin
```

---

# 2. Core Objectives

The backend is designed to provide:

1. Secure user authentication
2. Role-based access control
3. Secure password storage
4. Sensitive phone-number protection
5. Volunteer registration and verification
6. Assistance-request lifecycle management
7. Emergency detection and escalation
8. Volunteer assignment
9. Request status tracking
10. Request history and auditability
11. DTMF/keypad-based request creation
12. Notification generation
13. Refresh-token rotation and revocation
14. Centralized API responses and error handling
15. MongoDB-based persistence

---

# 3. Technology Stack

| Layer                     | Technology                                |
| ------------------------- | ----------------------------------------- |
| Runtime                   | Node.js                                   |
| Backend Framework         | Express.js                                |
| Database                  | MongoDB                                   |
| Database Driver           | Official MongoDB Node.js Driver           |
| Authentication            | JWT                                       |
| Password Security         | bcrypt                                    |
| Token Security            | SHA-256 hashing + rotating refresh tokens |
| Sensitive Data Encryption | AES-256-GCM                               |
| Blind Index               | HMAC-SHA256                               |
| Cache / Infrastructure    | Redis / ioredis                           |
| API Testing               | Postman                                   |
| Configuration             | dotenv                                    |
| Development               | Nodemon                                   |
| API Architecture          | REST                                      |
| Module System             | CommonJS                                  |

---

# 4. Backend Architecture

Sahayak follows a modular Express architecture.

```text
                    ┌──────────────────────┐
                    │      Client Layer    │
                    │                      │
                    │ App / Postman / DTMF │
                    └──────────┬───────────┘
                               |
                               v
                    ┌──────────────────────┐
                    │    Express Server    │
                    │      /api/v1         │
                    └──────────┬───────────┘
                               |
             ┌─────────────────┼─────────────────┐
             |                 |                 |
             v                 v                 v
       Authentication     Request Layer     Volunteer Layer
             |                 |                 |
             v                 v                 v
          JWT/RBAC        Decision Layer    Verification
             |                 |                 |
             └─────────────────┼─────────────────┘
                               |
                               v
                       ┌──────────────┐
                       │   MongoDB    │
                       └──────────────┘
                               |
               ┌───────────────┼───────────────┐
               v               v               v
          Users / Tokens   Requests/History   Emergencies
```

---

# 5. Application Startup Flow

The backend starts through:

```text
src/server.js
```

Startup sequence:

```text
1. Load environment configuration
2. Validate required environment variables
3. Connect to MongoDB
4. Initialize users collection
5. Initialize refresh_tokens collection
6. Start Express HTTP server
7. Register graceful shutdown handlers
```

The server does not directly call `app.listen()` inside `app.js`.

Instead:

```text
app.js
   |
   | builds Express application
   v
server.js
   |
   | starts HTTP listener
   v
Running API
```

This separation keeps the Express application independently testable.

---

# 6. API Versioning

All application routes are exposed under:

```text
/api/v1
```

Example:

```text
GET /api/v1/health
POST /api/v1/auth/login
POST /api/v1/volunteers/register
POST /api/v1/requests
GET /api/v1/requests
```

API versioning allows future versions to be introduced without breaking existing clients.

---

# 7. Project Structure

```text
sahayak-backend/
│
├── src/
│   │
│   ├── app.js
│   ├── server.js
│   │
│   ├── config/
│   │   ├── constants.js
│   │   ├── env.js
│   │   ├── mongodb.js
│   │   ├── redis.js
│   │   └── db.js
│   │
│   ├── database/
│   │   ├── mongodb/
│   │   │   ├── initUsersCollection.js
│   │   │   ├── initRefreshTokensCollection.js
│   │   │   └── verifyUsersCollection.js
│   │   │
│   │   └── migrations/
│   │       └── 005_create_users_table.sql
│   │
│   ├── middleware/
│   │   ├── authenticate.js
│   │   ├── requireRole.js
│   │   └── errorHandler.js
│   │
│   ├── routes/
│   │   ├── index.js
│   │   ├── auth.js
│   │   ├── volunteers.js
│   │   ├── volunteerBusiness.js
│   │   ├── requests.js
│   │   ├── emergencies.js
│   │   └── voice.js
│   │
│   ├── services/
│   │   ├── aiDecisionService.js
│   │   └── notificationService.js
│   │
│   └── utils/
│       ├── apiResponse.js
│       ├── asyncHandler.js
│       ├── jwt.js
│       ├── logger.js
│       ├── otpService.js
│       ├── password.js
│       ├── phoneSecurity.js
│       └── refreshToken.js
│
├── postman/
│   ├── Sahayak.postman_collection.json
│   ├── Sahayak.postman_environment.json
│   └── Sahayak_Stage3_6.postman_collection.json
│
├── .env.example
├── .gitignore
├── package.json
└── package-lock.json
```

---

# 8. Authentication Architecture

Sahayak uses a two-token authentication architecture.

```text
                Login
                  |
                  v
          Verify credentials
                  |
        ┌─────────┴─────────┐
        v                   v
   Access Token        Refresh Token
     JWT                  Random
     15 min              ~30 days
        |                   |
        v                   v
    API access       Stored as SHA-256
                     hash in MongoDB
```

## Access Token

The access token is a JWT containing:

```json
{
  "sub": "user-id",
  "email": "user@example.com",
  "role": "volunteer"
}
```

The backend verifies:

* Token signature
* HS256 algorithm
* Subject/user ID
* Email
* Role
* Token expiration

The token is sent using:

```http
Authorization: Bearer <access-token>
```

---

# 9. Password Security

Passwords are never stored as plaintext.

The backend uses:

```text
bcrypt
```

with:

```text
12 salt rounds
```

Registration:

```text
Plain Password
      |
      v
bcrypt
      |
      v
Password Hash
      |
      v
MongoDB
```

Login:

```text
Submitted Password
       |
       v
bcrypt.compare()
       |
       v
Stored Password Hash
```

The original password cannot be recovered from the stored bcrypt hash.

---

# 10. Phone Number Security

Phone numbers are treated as sensitive information.

Sahayak uses two separate mechanisms:

### 10.1 AES-256-GCM Encryption

The phone number is encrypted using:

```text
AES-256-GCM
```

The encrypted representation contains:

```text
IV
Ciphertext
Authentication Tag
```

This provides confidentiality and tamper detection.

### 10.2 HMAC Blind Index

Searching encrypted phone numbers directly is inefficient because secure encryption produces different ciphertexts.

Therefore Sahayak also creates:

```text
HMAC-SHA256(normalizedPhoneNumber)
```

This produces a deterministic blind index.

Example:

```text
Phone Number
     |
     +--------------------+
     |                    |
     v                    v
AES-256-GCM          HMAC-SHA256
     |                    |
     v                    v
Encrypted Phone       Blind Index
     |                    |
     +----------+---------+
                |
                v
             MongoDB
```

The blind index is used for uniqueness checks without storing the plaintext phone number.

---

# 11. OTP Registration Flow

Volunteer registration uses OTP verification.

```text
Client
  |
  | POST /generate-otp
  v
OTP Service
  |
  | Generate 6-digit OTP
  | TTL = 5 minutes
  v
Client
  |
  | name + phone + email +
  | password + OTP
  v
/register
  |
  +--> Validate fields
  |
  +--> Normalize phone
  |
  +--> Check phone blind index
  |
  +--> Check email uniqueness
  |
  +--> Verify OTP
  |
  +--> Encrypt phone
  |
  +--> bcrypt password
  |
  v
MongoDB users
```

The current OTP implementation is intentionally development-oriented and stores OTP state in memory. A production deployment should replace this with a distributed OTP store and a real SMS/telephony provider.

---

# 12. Refresh Token Rotation

Refresh tokens are generated using cryptographically secure random bytes.

The plaintext refresh token is returned to the client, but only its SHA-256 hash is persisted.

```text
Refresh Token
      |
      v
SHA-256
      |
      v
Token Hash
      |
      v
MongoDB
```

When a refresh request occurs:

```text
Old Refresh Token
       |
       v
Hash token
       |
       v
Find stored hash
       |
       v
Validate:
- not expired
- not revoked
       |
       v
Revoke old token
       |
       v
Generate new refresh token
       |
       v
Store new hash
       |
       v
Return new access + refresh tokens
```

A token family identifier is also maintained.

If a revoked refresh token is reused, the implementation revokes the remaining tokens in that token family.

This provides a mechanism for detecting refresh-token reuse.

---

# 13. Role-Based Access Control

Sahayak currently defines two primary roles:

```text
volunteer
police_admin
```

Authentication and authorization are separate layers.

### Authentication

```text
Who are you?
```

Handled by:

```text
authenticate.js
```

### Authorization

```text
Are you allowed to perform this operation?
```

Handled by:

```text
requireRole.js
```

Example:

```text
Request
  |
  v
JWT Authentication
  |
  +---- Invalid ---> 401 Unauthorized
  |
  v
Role Check
  |
  +---- Wrong role ---> 403 Forbidden
  |
  v
Controller
```

This distinction is important because:

```text
401 = authentication problem
403 = authorization problem
```

---

# 14. Assistance Request Lifecycle

Assistance requests use a state-based workflow.

Possible states include:

```text
new
pending_assignment
assigned
accepted
in_progress
completed
cancelled
escalated_to_112
```

Typical workflow:

```text
Request Created
      |
      v
AI/Decision Layer
      |
      +------------------------+
      |                        |
      v                        v
Routine/Urgent             Critical /
      |                    Low Confidence
      v                        |
pending_assignment             v
      |                    escalated_to_112
      v
Police Admin Assignment
      |
      v
assigned
      |
      v
Volunteer Accepts
      |
      v
accepted
      |
      v
in_progress
      |
      v
completed
```

---

# 15. AI Decision Layer

The current backend contains a decision service:

```text
src/services/aiDecisionService.js
```

The service considers:

```text
urgency
AI confidence
```

The current confidence threshold is:

```text
0.70
```

Decision logic:

```text
IF urgency == critical
        |
        +----> Emergency

OR

IF confidence < 0.70
        |
        +----> Emergency

Otherwise
        |
        +----> Volunteer assignment allowed
```

This creates a safety-oriented backend rule:

```text
Critical request
       OR
Low-confidence classification
       |
       v
Emergency escalation
```

The backend does not independently claim that an AI model has correctly understood the user. Instead, the AI classification can be treated as advisory input to the decision layer.

---

# 16. Emergency Escalation

Critical or low-confidence requests can be escalated to:

```text
112
```

The backend creates an `emergency_escalations` record.

Example lifecycle:

```text
Critical Request
      |
      v
escalated_to_112
      |
      v
Emergency Record
      |
      v
Police Admin
      |
      +--> Acknowledge
      |
      +--> Resolve
      |
      +--> Mark contact_112_reported
```

Emergency operations are protected using:

```text
JWT authentication
+
police_admin authorization
```

---

# 17. Volunteer Workflow

A volunteer must be properly verified and available before assignment.

Volunteer states include:

```text
verification_status:
- pending
- verified
- rejected
- suspended
```

Availability:

```text
is_available: true / false
```

Assignment validation checks:

```text
Volunteer exists
      +
Verification == verified
      +
Availability == true
```

Only then can a police administrator assign an assistance request.

---

# 18. Request Assignment Flow

```text
Police Admin
     |
     | POST /requests/:id/assign
     v
Validate Request
     |
     v
Validate Volunteer
     |
     +--> verified?
     |
     +--> available?
     |
     v
Assign Volunteer
     |
     +--> assistance_requests
     |
     +--> request_assignments
     |
     +--> request_status_history
     |
     +--> notifications
     |
     v
Status = assigned
```

The system also records assignment history separately from the current request state.

---

# 19. Request Audit History

Important request events are stored in:

```text
request_status_history
```

Examples include:

```text
REQUEST_CREATED
REQUEST_ASSIGNED
REQUEST_ACCEPTED
REQUEST_STATUS_CHANGED
REQUEST_ESCALATED
EMERGENCY_ACKNOWLEDGED
EMERGENCY_RESOLVED
```

This provides an auditable timeline of how an assistance request changed over time.

Example:

```text
10:00 Request Created
       |
10:01 Assigned
       |
10:03 Accepted
       |
10:10 In Progress
       |
10:30 Completed
```

---

# 20. DTMF / Keypad Phone Workflow

One of the accessibility-focused changes is support for keypad/DTMF interaction.

A basic phone does not require:

* Smartphone application
* Mobile internet
* Touchscreen
* Speech recognition

The interaction can be represented as:

```text
Phone Call
    |
    v
Telephony / IVR Provider
    |
    | DTMF digit
    v
Sahayak /voice/webhook
    |
    v
DTMF Mapping
```

Current mapping:

```text
1 -> Medicine
2 -> Groceries
3 -> Transport
4 -> Emergency
5 -> Other
```

For example:

```text
Caller presses 4
       |
       v
DTMF = 4
       |
       v
category = emergency
urgency = critical
       |
       v
Decision Service
       |
       v
Emergency Escalation
```

The webhook also records a unique `call_sid` so duplicate webhook processing can be detected.

---

# 21. DTMF Request Processing

The endpoint:

```http
POST /api/v1/voice/webhook
```

expects information such as:

```json
{
  "call_sid": "unique-call-id",
  "caller_phone": "+91XXXXXXXXXX",
  "dtmf": "4"
}
```

Processing:

```text
Validate webhook
      |
      v
Validate call_sid
      |
      v
Validate caller phone
      |
      v
Validate DTMF digit
      |
      v
Map DTMF -> category
      |
      v
Determine urgency
      |
      v
Create assistance request
      |
      v
Create call log
      |
      v
Create request history
      |
      v
If emergency:
Create emergency escalation
```

The current implementation is **provider-neutral**. A production system would connect the webhook to a telecom/IVR provider capable of receiving real DTMF events.

---

# 22. MongoDB Data Architecture

The project migrated from the originally planned relational database approach to MongoDB.

Core collections used by the implemented backend include:

```text
users
refresh_tokens
volunteers
assistance_requests
request_assignments
request_status_history
emergency_escalations
notifications
call_logs
volunteer_verifications
```

Conceptually:

```text
users
 |
 +---- refresh_tokens
 |
 +---- volunteers
          |
          +---- volunteer_verifications
          |
          +---- request_assignments
                    |
                    v
             assistance_requests
                    |
          +---------+---------+
          |                   |
          v                   v
 request_status_history   emergency_escalations
```

---

# 23. MongoDB Schema Validation

MongoDB collection-level JSON Schema validation is used for important collections.

For example, the `users` collection validates fields such as:

```text
password_hash
role
account_status
created_at
updated_at
```

Role values are constrained to:

```text
volunteer
police_admin
```

Account status values include:

```text
active
suspended
deleted
```

Invalid documents can therefore be rejected at the database layer instead of relying entirely on application-level validation.

---

# 24. MongoDB Indexing

Indexes are created for important lookup operations.

### Users

```text
phone_number_blind_index
email
```

The phone blind index is uniquely indexed.

Email uniqueness is enforced using a case-insensitive collation.

### Refresh Tokens

Indexes include:

```text
token_hash
token_family_id
user_id
expires_at
```

The `expires_at` field uses a MongoDB TTL index.

This allows expired refresh-token records to be automatically removed by MongoDB.

---

# 25. Notification Architecture

Notifications are persisted as records instead of being treated only as transient messages.

A notification contains fields such as:

```text
recipient_user_id
type
message
status
attempt_count
created_at
updated_at
```

Example workflow:

```text
Request Assigned
       |
       v
Notification Service
       |
       v
notifications collection
       |
       v
Volunteer receives notification
```

This creates a foundation for future asynchronous notification delivery.

---

# 26. Redis

Redis is integrated through:

```text
ioredis
```

The project contains a centralized Redis client and health reporting.

Redis is intended to support infrastructure concerns such as:

* caching
* asynchronous processing
* distributed coordination
* future queue/worker functionality

The current backend does not depend on Redis for the core MongoDB request transaction flow.

Therefore, Redis availability is monitored separately from the primary MongoDB persistence layer.

---

# 27. Error Handling

The backend uses centralized error handling.

Route handlers are wrapped using:

```text
asyncHandler()
```

Instead of writing repetitive:

```javascript
try {
    ...
} catch(error) {
    ...
}
```

inside every route, asynchronous errors are forwarded to the Express error middleware.

API responses are standardized.

### Success

```json
{
  "success": true,
  "data": {}
}
```

### Error

```json
{
  "success": false,
  "error": "Error message"
}
```

This makes the API easier for frontend clients and Postman tests to consume.

---

# 28. HTTP Status Codes

The backend uses standard HTTP status codes.

| Code | Meaning                        |
| ---- | ------------------------------ |
| 200  | Successful operation           |
| 201  | Resource created               |
| 400  | Invalid request                |
| 401  | Authentication required/failed |
| 403  | Insufficient permissions       |
| 404  | Resource not found             |
| 409  | Conflict                       |
| 500  | Internal server error          |

Example:

```text
Invalid JWT
    |
    v
401 Unauthorized

Valid JWT + wrong role
    |
    v
403 Forbidden
```

---

# 29. Health Check

Endpoint:

```http
GET /api/v1/health
```

The health endpoint reports:

```text
application
server
database
redis
timestamp
```

Example:

```json
{
  "success": true,
  "data": {
    "application": "ok",
    "server": "ok",
    "database": "ok",
    "redis": "ok",
    "timestamp": "..."
  }
}
```

This provides a simple operational check for the backend.

---

# 30. API Endpoints

## Authentication

| Method | Endpoint               | Purpose              |
| ------ | ---------------------- | -------------------- |
| POST   | `/api/v1/auth/login`   | Authenticate user    |
| POST   | `/api/v1/auth/refresh` | Rotate refresh token |
| POST   | `/api/v1/auth/logout`  | Revoke refresh token |

---

## Volunteers

| Method | Endpoint                              | Purpose                         |
| ------ | ------------------------------------- | ------------------------------- |
| POST   | `/api/v1/volunteers/generate-otp`     | Generate development OTP        |
| POST   | `/api/v1/volunteers/register`         | Register volunteer              |
| GET    | `/api/v1/volunteers/:id`              | Get volunteer profile           |
| PATCH  | `/api/v1/volunteers/:id/availability` | Update availability             |
| PATCH  | `/api/v1/volunteers/:id/verification` | Police admin verifies volunteer |

---

## Assistance Requests

| Method | Endpoint                        | Purpose                   |
| ------ | ------------------------------- | ------------------------- |
| POST   | `/api/v1/requests`              | Create assistance request |
| GET    | `/api/v1/requests`              | List visible requests     |
| GET    | `/api/v1/requests/:id`          | Get request               |
| POST   | `/api/v1/requests/:id/assign`   | Assign volunteer          |
| POST   | `/api/v1/requests/:id/accept`   | Accept assignment         |
| PATCH  | `/api/v1/requests/:id/status`   | Update request status     |
| GET    | `/api/v1/requests/:id/history`  | View request history      |
| POST   | `/api/v1/requests/:id/escalate` | Escalate to 112           |

---

## Emergencies

| Method | Endpoint                              | Purpose                    |
| ------ | ------------------------------------- | -------------------------- |
| GET    | `/api/v1/emergencies`                 | List emergency escalations |
| POST   | `/api/v1/emergencies/:id/acknowledge` | Acknowledge emergency      |
| POST   | `/api/v1/emergencies/:id/resolve`     | Resolve emergency          |

---

## DTMF

| Method | Endpoint                | Purpose              |
| ------ | ----------------------- | -------------------- |
| POST   | `/api/v1/voice/webhook` | Process DTMF request |

---

# 31. Example End-to-End Request

A normal assistance workflow can be represented as:

```text
1. User submits assistance request
             |
             v
2. Backend validates request
             |
             v
3. Decision service evaluates urgency/confidence
             |
       +-----+-----+
       |           |
       v           v
   Emergency    Normal
       |           |
       v           v
 112 escalation   Pending assignment
                   |
                   v
             Police Admin
                   |
                   v
            Select volunteer
                   |
                   v
             Verify volunteer
                   |
                   v
                Assign
                   |
                   v
              Notification
                   |
                   v
             Volunteer
                   |
                   v
               Accept
                   |
                   v
             In Progress
                   |
                   v
              Completed
```

---

# 32. Security Model

The backend applies security at multiple layers.

### Application Layer

* Input validation
* JWT verification
* Role-based authorization
* Standardized error responses
* Async error handling

### Credential Layer

* bcrypt password hashing
* Passwords never stored as plaintext
* Refresh tokens stored as hashes

### Sensitive Data Layer

* AES-256-GCM encryption
* HMAC-SHA256 blind indexes
* Separate encryption and blind-index secrets

### Database Layer

* MongoDB schema validation
* Unique indexes
* TTL indexes
* ObjectId validation

### Workflow Layer

* Volunteer verification
* Volunteer availability checks
* Request state validation
* Emergency escalation rules
* Request audit history

---

# 33. Environment Configuration

Configuration is loaded through:

```text
.env
```

The application validates required environment variables during startup.

Important configuration includes:

```text
NODE_ENV
PORT
MONGODB_URI
MONGODB_DB_NAME
JWT_SECRET
JWT_ACCESS_TOKEN_EXPIRES_IN
PHONE_ENCRYPTION_KEY
PHONE_BLIND_INDEX_SECRET
REDIS_URL
```

Never commit real credentials or secrets to GitHub.

Create the local environment file from:

```text
.env.example
```

and replace all placeholder values with secure local/deployment secrets.

---

# 34. Installation

### Clone the repository

```bash
git clone <repository-url>
cd sahayak-backend
```

### Install dependencies

```bash
npm install
```

### Configure environment

Create:

```text
.env
```

Configure MongoDB and required secrets.

### Start development server

```bash
npm run dev
```

### Start production-style Node process

```bash
npm start
```

Default backend port:

```text
5000
```

---

# 35. Testing With Postman

The project includes Postman collections under:

```text
postman/
```

Import:

```text
Sahayak.postman_collection.json
```

and:

```text
Sahayak.postman_environment.json
```

The Postman workflow can be used to test:

```text
Health
   ↓
OTP Generation
   ↓
Volunteer Registration
   ↓
Login
   ↓
JWT Authentication
   ↓
Protected APIs
   ↓
Role-Based Access
   ↓
Request Creation
   ↓
Assignment
   ↓
Acceptance
   ↓
Status Update
   ↓
Emergency Escalation
```

Important negative test cases include:

```text
Invalid credentials
Missing JWT
Invalid JWT
Wrong role
Invalid ObjectId
Duplicate phone number
Duplicate email
Invalid OTP
Expired OTP
Unavailable volunteer
Unverified volunteer
Invalid request state
Invalid DTMF
```

---

# 36. Example Authentication Request

```http
POST /api/v1/auth/login
Content-Type: application/json
```

```json
{
  "email": "volunteer@example.com",
  "password": "your-password"
}
```

Successful authentication returns:

```json
{
  "success": true,
  "data": {
    "userId": "...",
    "email": "volunteer@example.com",
    "role": "volunteer",
    "account_status": "active",
    "accessToken": "...",
    "refreshToken": "...",
    "message": "Login successful."
  }
}
```

---

# 37. Example Protected Request

```http
GET /api/v1/requests
Authorization: Bearer <access-token>
```

The authentication middleware validates the token before the request reaches the route handler.

---

# 38. Development Design Principles

The backend follows several design principles:

### Separation of concerns

```text
Routes
  |
  +--> Middleware
  |
  +--> Services
  |
  +--> Database
  |
  +--> Utilities
```

### Centralized configuration

Only the environment configuration module directly reads environment variables.

### Reusable utilities

Security functions such as:

```text
hashPassword()
verifyPassword()
generateAccessToken()
generateRefreshToken()
hashRefreshToken()
encryptPhoneNumber()
decryptPhoneNumber()
createPhoneBlindIndex()
```

are isolated from route logic.

### Predictable API responses

All API responses follow a consistent JSON structure.

### Database validation

Important data constraints are enforced both by application logic and MongoDB schema/index configuration.

---

# 39. Current Implementation vs Future Production Extensions

The current implementation establishes the core backend architecture, but several components can be extended for production deployment.

### Current

* MongoDB persistence
* JWT authentication
* bcrypt password hashing
* Refresh-token rotation
* RBAC
* Volunteer management
* Request lifecycle
* Emergency escalation
* DTMF webhook
* Development OTP
* Notification persistence
* Request audit history

### Future production extensions

* Production SMS/OTP provider
* Production telephony/IVR provider
* Distributed OTP storage
* Redis-backed queues/workers
* Real-time notification delivery
* WebSocket/SSE dashboard updates
* External emergency-service integration
* Rate limiting
* API gateway
* Structured logging
* Monitoring and tracing
* Automated CI/CD
* Containerized deployment
* Automated integration/end-to-end tests
* Production secret management

---

# 40. Important Implementation Note

The DTMF functionality currently provides the **backend webhook and request-processing layer**.

It does not itself establish a cellular telephone connection.

The production architecture would be:

```text
Feature Phone
     |
     | Cellular call
     v
Telephony / IVR Provider
     |
     | HTTP webhook + DTMF
     v
Sahayak Backend
     |
     v
MongoDB
```

Therefore, the backend is prepared to receive DTMF events, while the telecom/IVR provider would be responsible for receiving the actual phone call and forwarding DTMF events to the backend.

---

# 41. Why MongoDB?

MongoDB is used as the primary persistence layer because the Sahayak domain contains several evolving entities and workflow records:

```text
Users
Volunteers
Requests
Assignments
Notifications
Emergency records
Request history
Call logs
```

MongoDB's document model allows these records to evolve as the application's workflow grows while still providing:

* Indexing
* Unique constraints
* Schema validation
* TTL indexes
* Transactions where required
* ObjectId references
* Flexible document structures

The refresh-token rotation flow also uses MongoDB transactions to atomically revoke and replace refresh tokens.

---

# 42. Reliability Considerations

The backend uses several mechanisms to improve reliability:

### Duplicate DTMF webhook protection

The `call_sid` is checked before processing a voice webhook.

### Request state validation

Invalid transitions are rejected instead of blindly updating the request.

### Volunteer validation

Assignments require:

```text
verified + available
```

### Refresh-token reuse detection

Reusing a revoked refresh token can invalidate the associated token family.

### Database constraints

Unique indexes prevent duplicate identities such as:

```text
phone blind index
email
refresh token hash
```

---

# 43. Technical Highlights

The main backend engineering highlights are:

```text
✓ Node.js + Express REST API
✓ API versioning
✓ MongoDB architecture
✓ MongoDB schema validation
✓ MongoDB indexing
✓ JWT authentication
✓ Role-based authorization
✓ bcrypt password hashing
✓ Refresh-token rotation
✓ Refresh-token reuse detection
✓ AES-256-GCM phone encryption
✓ HMAC-SHA256 phone blind indexing
✓ OTP verification
✓ Volunteer verification workflow
✓ Assistance request state machine
✓ Emergency escalation
✓ Request audit history
✓ DTMF/keypad interaction
✓ Notification persistence
✓ Centralized error handling
✓ Postman API testing
✓ Environment-based configuration
```

---

# 44. End-to-End Technical Summary

At a high level, Sahayak works as follows:

```text
                 USER
                  |
        ┌─────────┴─────────┐
        |                   |
     APP/API             PHONE/DTMF
        |                   |
        └─────────┬─────────┘
                  |
                  v
          EXPRESS REST API
                  |
        ┌─────────┼──────────┐
        |         |          |
        v         v          v
     AUTH       REQUEST    VOICE
        |         |          |
        v         v          v
      JWT      DECISION     DTMF
        |         |          |
        └─────────┼──────────┘
                  |
                  v
              MONGODB
                  |
      ┌───────────┼────────────┐
      |           |            |
      v           v            v
   Users       Requests     Emergencies
      |           |            |
      v           v            v
 Volunteers   Assignments   Police Admin
                  |
                  v
             Notifications
                  |
                  v
              Volunteers
```

The backend therefore acts as the central coordination and security layer between users, volunteers, police administrators, accessibility channels, and persistent application data.

---

# 45. Project Status

The current implementation represents the backend implementation phase of Sahayak and includes the core authentication, authorization, database, volunteer, request, emergency, and DTMF foundations required for the demonstrated workflow.

The architecture is intentionally modular so additional AI, telephony, real-time communication, notification, and deployment infrastructure can be added without restructuring the complete backend.

---

## License

This project was developed as a hackathon/project implementation for Sahayak.
