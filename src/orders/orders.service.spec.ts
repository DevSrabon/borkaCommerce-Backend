import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { order_status } from '@prisma/client';

describe('OrdersService Address & Status Tests', () => {
  let service: OrdersService;
  let prisma: any;
  let notificationsService: any;
  let mailService: any;
  let configService: any;
  let uploadFilesService: any;

  beforeEach(() => {
    prisma = {
      orders: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      customers: {
        update: jest.fn().mockResolvedValue({}),
      },
      product_variants: {
        findUnique: jest.fn(),
      },
      customer_addresses: {
        findFirst: jest.fn(),
      },
    };
    notificationsService = {
      createNotification: jest.fn(),
    };
    mailService = {
      sendOrderConfirmation: jest.fn(),
      sendAdminNewOrderNotification: jest.fn(),
    };
    configService = {
      get: jest.fn().mockReturnValue('mock-key'),
    };
    uploadFilesService = {};

    service = new OrdersService(
      prisma,
      notificationsService,
      mailService,
      configService,
      uploadFilesService as any,
    );

    // Mock findOne to return the latest updated order from prisma.orders.update
    jest.spyOn(service, 'findOne').mockImplementation(async (id: string) => {
      const lastUpdate = prisma.orders.update.mock.results.slice(-1)[0]?.value;
      return lastUpdate || { id };
    });
  });

  describe('updateOrderAddress', () => {
    it('allows updating address when order status is PENDING', async () => {
      const orderId = 'order-1';
      prisma.orders.findUnique.mockResolvedValue({
        id: orderId,
        status: order_status.PENDING,
      });
      prisma.orders.update.mockResolvedValue({
        id: orderId,
        status: order_status.PENDING,
        shipping_country: 'United Arab Emirates',
        shipping_phone: '+971501112222',
        shipping_city: 'Abu Dhabi',
        shipping_postal_code: '00000',
        shipping_full_address: 'Villa 12, Corniche Road',
      });

      const res = await service.updateOrderAddress(orderId, {
        country: 'United Arab Emirates',
        phone: '+971501112222',
        city: 'Abu Dhabi',
        postal_code: '00000',
        full_address: 'Villa 12, Corniche Road',
      });

      expect(res.shipping_full_address).toBe('Villa 12, Corniche Road');
      expect(prisma.orders.update).toHaveBeenCalledWith({
        where: { id: orderId },
        data: expect.objectContaining({
          shipping_country: 'United Arab Emirates',
          shipping_phone: '+971501112222',
          shipping_city: 'Abu Dhabi',
          shipping_postal_code: '00000',
          shipping_full_address: 'Villa 12, Corniche Road',
        }),
      });
    });

    it('allows updating address when order status is CONFIRMED', async () => {
      const orderId = 'order-2';
      prisma.orders.findUnique.mockResolvedValue({
        id: orderId,
        status: order_status.CONFIRMED,
      });
      prisma.orders.update.mockResolvedValue({
        id: orderId,
        status: order_status.CONFIRMED,
        shipping_full_address: 'Al Reem Island Tower 3',
      });

      const res = await service.updateOrderAddress(orderId, {
        full_address: 'Al Reem Island Tower 3',
      });

      expect(res.shipping_full_address).toBe('Al Reem Island Tower 3');
    });

    it('allows updating address when order status is PACKED', async () => {
      const orderId = 'order-3';
      prisma.orders.findUnique.mockResolvedValue({
        id: orderId,
        status: order_status.PACKED,
      });
      prisma.orders.update.mockResolvedValue({
        id: orderId,
        status: order_status.PACKED,
        shipping_full_address: 'Deira Gold Souk Building 5',
      });

      const res = await service.updateOrderAddress(orderId, {
        full_address: 'Deira Gold Souk Building 5',
      });

      expect(res.shipping_full_address).toBe('Deira Gold Souk Building 5');
    });

    it('blocks updating address when order status is DELIVERED', async () => {
      const orderId = 'order-4';
      prisma.orders.findUnique.mockResolvedValue({
        id: orderId,
        status: order_status.DELIVERED,
      });

      await expect(
        service.updateOrderAddress(orderId, { full_address: 'Cannot update' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('blocks customer update if order is CANCELLED', async () => {
      const orderId = 'order-5';
      const customerId = 'cust-1';
      prisma.orders.findUnique.mockResolvedValue({
        id: orderId,
        customer_id: customerId,
        status: order_status.CANCELLED,
      });

      await expect(
        service.customerUpdateOrderAddress(customerId, orderId, { full_address: 'Cannot update' }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
