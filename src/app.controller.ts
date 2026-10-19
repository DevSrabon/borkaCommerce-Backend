import { Controller, Get, Req, Res } from '@nestjs/common';
import { AppService } from './app.service';
import type { Request, Response } from 'express';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getRoot(@Req() req: Request, @Res() res: Response) {
    const accept = req.headers['accept'] || '';
    if (typeof accept === 'string' && accept.includes('text/html')) {
      return res.type('text/html').send(this.appService.getStatusHtml());
    }
    return res.json(this.appService.getStatusJson());
  }

  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      service: 'Saba Al Wadi API',
      timestamp: new Date().toISOString(),
    };
  }
}

