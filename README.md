# Crypto Deposit Hub

MASTER PROMPT – Automatic TRC20 USDT Deposit Verification Demo

Build a production-quality crypto deposit verification web application. This is a demonstration system but the architecture must be designed exactly like a real cryptocurrency exchange so it can later be expanded into a complete production platform.

Objective

The application must automatically verify USDT (TRC20) deposits on the TRON blockchain without requiring traders to upload screenshots or manually submit transaction IDs.

The system must continuously monitor blockchain transactions, detect incoming deposits, verify them, update confirmations in real time, and automatically credit the trader after successful verification.

The entire project must be modular, scalable, secure, and follow professional enterprise architecture.

⸻

Technology Stack

Frontend

React

TypeScript

Tailwind CSS

Responsive Design

Dark Professional Crypto Theme

Backend

Supabase

PostgreSQL

Edge Functions

REST API

Realtime Database

Architecture

Frontend

Backend API

Blockchain Listener Service

Database Layer

The blockchain listener must be isolated from the frontend.

⸻

User Roles

Admin

Trader

⸻

Admin Panel

Admin Dashboard must contain

Total Deposits

Pending Deposits

Transaction Detected

Confirming

Confirmed

Failed

Total Deposit Volume

Today’s Deposits

Total Traders

Live Blockchain Status

Latest Block Number

Listener Status

Wallet Status

⸻

Company Wallet Management

Admin can

Add Company Wallet

Edit Wallet

Disable Wallet

Enable Wallet

Select Default Wallet

Every wallet must have

Wallet Name

Wallet Address

Network

Status

Created Time

Updated Time

Demo version may use one active wallet but database must already support multiple wallets.

⸻

Trader Dashboard

Trader can

Enter Deposit Amount

Generate Deposit Request

View Assigned Wallet

Copy Wallet Address

View QR Code

See Live Deposit Status

See Confirmation Progress

View Deposit History

See Wallet Balance

No Screenshot Upload

No TXID Submission

Everything must be automatic.

⸻

Deposit Workflow

Trader enters deposit amount.

System creates a Deposit Request.

System assigns active company wallet.

Trader transfers USDT.

Blockchain Listener starts monitoring.

Incoming transaction detected.

Verify

Receiver Address

USDT Contract

Network

Amount

Block Number

Timestamp

TXID

Confirmation Count

Transaction Status

If everything matches

Status becomes

Transaction Detected

↓

Confirming

↓

Confirmed

↓

Trader Balance Credited Automatically

If verification fails

Status becomes Failed.

⸻

Live Blockchain Monitoring

Application must continuously monitor blockchain.

The listener must

Poll blockchain automatically

Detect new transactions

Ignore duplicate transactions

Ignore already processed TXIDs

Update confirmations in real time

Update database automatically

Broadcast realtime updates to frontend

⸻

Transaction Verification Rules

Verify

Correct Wallet Address

Correct Network

USDT Token Contract

Transaction Success

Unique TXID

Amount

Confirmation Count

Timestamp

Receiver Address

Duplicate Prevention

Double Processing Prevention

If every rule passes

Automatically credit balance.

⸻

Deposit Status

Waiting

Transaction Detected

Confirming

Confirmed

Failed

Expired

Every status must have different badge colors.

⸻

Admin Transaction Table

Columns

Order ID

Trader

Wallet Address

Sender Address

Receiver Address

Amount

Network

TXID

Block Number

Confirmations

Created Time

Confirmed Time

Status

Explorer Link

Search

Filter

Pagination

Sorting

Export CSV

⸻

Trader Deposit History

Deposit ID

Amount

Status

TXID

Confirmations

Time

Explorer Link

Search

Pagination

⸻

Blockchain Explorer

Every transaction must contain

View on Explorer

Open in new tab

⸻

Realtime Updates

Use Supabase realtime.

No manual refresh.

Dashboard updates automatically.

Confirmation count updates automatically.

Status changes automatically.

⸻

Notifications

Trader

Deposit Detected

Confirming

Deposit Successful

Deposit Failed

Admin

New Deposit

Large Deposit

Failed Deposit

Listener Offline

Wallet Disabled

⸻

Database Design

Tables

users

wallets

deposit_requests

transactions

blockchain_events

listener_logs

notifications

system_settings

audit_logs

Future ready for multiple wallets.

⸻

API Design

Create modular APIs

Authentication

Wallet Management

Deposit Request

Blockchain Listener

Transaction Verification

Notification

Admin Dashboard

Trader Dashboard

Realtime Events

Health Check

⸻

Security

JWT Authentication

Role Based Access

Server Side Validation

Rate Limiting

Duplicate TXID Protection

Replay Protection

Input Validation

SQL Injection Protection

XSS Protection

CSRF Protection

Secure Environment Variables

Audit Logging

⸻

Blockchain Listener

Separate Service

Background Worker

Auto Retry

Error Handling

Health Status

Logging

Realtime Event Push

⸻

UI Design

Professional crypto exchange style.

Dark Theme

Modern Cards

Animated Status

Loading Skeletons

Responsive Layout

Mobile Friendly

Desktop Friendly

Smooth Animations

Professional Typography

Status Icons

Professional Charts

No placeholder UI.

⸻

Error Handling

Invalid Address

Wrong Token

Wrong Network

Amount Mismatch

Duplicate Transaction

Transaction Failed

Blockchain Timeout

Listener Offline

Database Error

API Error

Everything must display professional user-friendly messages.

⸻

Logging

Every action must be logged.

Wallet Assignment

Deposit Request

Transaction Detection

Verification

Confirmation

Balance Credit

Errors

Authentication

Admin Actions

⸻

Future Scalability

Architecture must already support

Unlimited Wallets

Unique Wallet Per Trader

Unique Wallet Per Order

HD Wallet Integration

Automatic Address Generation

Automatic Sweep

Cold Wallet

Hot Wallet

Risk Engine

AML Module

Webhook Callbacks

Merchant APIs

Microservice Architecture

Horizontal Scaling

Queue Processing

⸻

Code Quality

Use reusable components.

No duplicate code.

Type-safe architecture.

Proper folder structure.

Clean APIs.

Professional naming conventions.

Modular services.

Comments where required.

Production-ready coding standards.

⸻

Final Requirement

Do not create a prototype.

Do not create mock logic.

Do not hardcode blockchain data.

Design the application exactly as if it will later become a production crypto payment gateway. Every module should already be structured for future expansion with minimal code changes.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://tron-flow-guard.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/7ea2feca-1504-4ea0-a2a4-bc2877beb701).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
