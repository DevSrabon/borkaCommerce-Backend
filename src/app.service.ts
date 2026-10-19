import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getStatusJson() {
    return {
      success: true,
      service: 'Saba Al Wadi E-Commerce API',
      version: '1.0.0',
      status: 'operational',
      message: 'Saba Al Wadi API Service is online and operational',
      documentation: '/api/docs',
      health: '/health',
      timestamp: new Date().toISOString(),
    };
  }

  getStatusHtml(): string {
    const time = new Date().toUTCString();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Saba Al Wadi API | Operational</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: radial-gradient(circle at 50% 20%, #17202a 0%, #0c0f14 100%);
      color: #e2e8f0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
      line-height: 1.5;
    }
    .container {
      width: 100%;
      max-width: 620px;
      background: rgba(18, 24, 38, 0.75);
      border: 1px solid rgba(212, 175, 55, 0.25);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border-radius: 20px;
      padding: 40px 32px;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6), 0 0 40px rgba(212, 175, 55, 0.08);
      text-align: center;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(16, 185, 129, 0.12);
      border: 1px solid rgba(16, 185, 129, 0.35);
      color: #34d399;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      padding: 6px 14px;
      border-radius: 9999px;
      margin-bottom: 20px;
    }
    .pulse-dot {
      width: 8px;
      height: 8px;
      background-color: #10b981;
      border-radius: 50%;
      box-shadow: 0 0 10px #10b981;
      animation: pulse 2s infinite ease-in-out;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
    }
    h1 {
      font-family: 'Outfit', sans-serif;
      font-size: 32px;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: #f8fafc;
      margin-bottom: 6px;
    }
    .arabic {
      font-family: 'Outfit', sans-serif;
      font-size: 18px;
      color: #d4af37;
      letter-spacing: 0.05em;
      margin-bottom: 16px;
      font-weight: 500;
    }
    .desc {
      color: #94a3b8;
      font-size: 14.5px;
      max-width: 460px;
      margin: 0 auto 28px;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      margin-bottom: 28px;
      text-align: left;
    }
    .meta-card {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 12px;
      padding: 14px 16px;
    }
    .meta-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #64748b;
      margin-bottom: 4px;
      font-weight: 600;
    }
    .meta-value {
      font-size: 13.5px;
      font-weight: 500;
      color: #cbd5e1;
      font-family: 'Outfit', monospace;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      justify-content: center;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 12px 22px;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 600;
      text-decoration: none;
      transition: all 0.2s ease;
      cursor: pointer;
    }
    .btn-primary {
      background: linear-gradient(135deg, #d4af37 0%, #aa8418 100%);
      color: #0c0f14;
      box-shadow: 0 4px 15px rgba(212, 175, 55, 0.25);
    }
    .btn-primary:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 20px rgba(212, 175, 55, 0.4);
    }
    .btn-secondary {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: #e2e8f0;
    }
    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.09);
      border-color: rgba(255, 255, 255, 0.22);
      transform: translateY(-1px);
    }
    .footer {
      margin-top: 28px;
      font-size: 12px;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="badge">
      <div class="pulse-dot"></div>
      System Operational
    </div>
    <h1>Saba Al Wadi API</h1>
    <div class="arabic">سابا الوادي • Luxury Modest Fashion</div>
    <p class="desc">
      Official REST & Realtime Backend Engine powering Saba Al Wadi eCommerce, inventory, order processing, and admin management.
    </p>

    <div class="meta-grid">
      <div class="meta-card">
        <div class="meta-label">Environment</div>
        <div class="meta-value">Production v1.0.0</div>
      </div>
      <div class="meta-card">
        <div class="meta-label">Status Check</div>
        <div class="meta-value" style="color: #34d399;">100% Operational</div>
      </div>
      <div class="meta-card">
        <div class="meta-label">Architecture</div>
        <div class="meta-value">NestJS • Prisma • PostgreSQL</div>
      </div>
      <div class="meta-card">
        <div class="meta-label">Server Time (UTC)</div>
        <div class="meta-value" style="font-size: 11.5px;">${time}</div>
      </div>
    </div>

    <div class="actions">
      <a class="btn btn-primary" href="/api/docs" target="_blank">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10"/><path d="M6 10h10"/></svg>
        Swagger API Docs
      </a>
      <a class="btn btn-secondary" href="/health">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
        Health Check
      </a>
      <a class="btn btn-secondary" href="https://sabaalwadi.com" target="_blank">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>
        Storefront
      </a>
    </div>

    <div class="footer">
      &copy; ${new Date().getFullYear()} Saba Al Wadi LLC. All rights reserved. Powered by BorkaCommerce.
    </div>
  </div>
</body>
</html>`;
  }
}

