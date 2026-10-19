import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello() {
    return {
      success: true,
      name: 'Saba Al Wadi API (BorkaCommerce)',
      version: '1.0.0',
      status: 'operational',
      message: 'Welcome to Saba Al Wadi E-Commerce API Service',
      health: '/health',
      timestamp: new Date().toISOString(),
    };
  }
}
