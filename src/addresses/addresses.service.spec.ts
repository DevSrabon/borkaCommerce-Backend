import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AddressesService } from './addresses.service';

describe('AddressesService Unit Tests', () => {
  let service: AddressesService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      customer_addresses: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
      },
      customers: {
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn(async (cb) => cb(prisma)),
    };
    service = new AddressesService(prisma);
  });

  describe('create address', () => {
    it('creates an address with strictly country, phone, city, postal_code, and full_address', async () => {
      const customerId = 'cust-123';
      const dto = {
        country: 'United Arab Emirates',
        phone: '+971501234567',
        city: 'Dubai',
        postal_code: '1213',
        full_address: 'Villa 14, Al Wasl Road, Jumeirah 1',
        is_default: true,
      };

      prisma.customer_addresses.findMany.mockResolvedValue([]);
      prisma.customer_addresses.create.mockResolvedValue({
        id: 'addr-1',
        customer_id: customerId,
        ...dto,
      });

      const result = await service.create(customerId, dto);
      expect(result.id).toBe('addr-1');
      expect(prisma.customer_addresses.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          customer_id: customerId,
          country: 'United Arab Emirates',
          phone: '+971501234567',
          city: 'Dubai',
          postal_code: '1213',
          full_address: 'Villa 14, Al Wasl Road, Jumeirah 1',
          is_default: true,
        }),
      });
    });

    it('rejects if full_address is missing or empty', async () => {
      const customerId = 'cust-123';
      const dto = {
        country: 'United Arab Emirates',
        phone: '+971501234567',
        city: 'Dubai',
        postal_code: '1213',
        full_address: '',
      };

      await expect(service.create(customerId, dto as any)).rejects.toThrow(BadRequestException);
    });

    it('rejects if phone is missing or empty', async () => {
      const customerId = 'cust-123';
      const dto = {
        country: 'United Arab Emirates',
        phone: '',
        city: 'Dubai',
        postal_code: '1213',
        full_address: 'Some valid street address',
      };

      await expect(service.create(customerId, dto as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('update address', () => {
    it('updates full_address and phone correctly', async () => {
      const customerId = 'cust-123';
      const addressId = 'addr-1';

      prisma.customer_addresses.findFirst.mockResolvedValue({
        id: addressId,
        customer_id: customerId,
        country: 'United Arab Emirates',
        phone: '+971500000000',
        city: 'Dubai',
        full_address: 'Old address',
      });

      prisma.customer_addresses.update.mockResolvedValue({
        id: addressId,
        customer_id: customerId,
        country: 'United Arab Emirates',
        phone: '+971509999999',
        city: 'Dubai',
        full_address: 'New luxury suite, Downtown',
      });

      const updated = await service.update(customerId, addressId, {
        full_address: 'New luxury suite, Downtown',
        phone: '+971509999999',
      });

      expect(updated.full_address).toBe('New luxury suite, Downtown');
      expect(updated.phone).toBe('+971509999999');
    });

    it('throws NotFoundException if address does not exist', async () => {
      prisma.customer_addresses.findFirst.mockResolvedValue(null);
      await expect(service.update('c-1', 'a-none', { city: 'Dubai' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('findOne address', () => {
    it('returns address if found', async () => {
      const mockAddr = { id: 'addr-1', customer_id: 'c-1', full_address: 'Dubai Mall Area' };
      prisma.customer_addresses.findFirst.mockResolvedValue(mockAddr);

      const result = await service.findOne('c-1', 'addr-1');
      expect(result).toEqual(mockAddr);
    });

    it('throws NotFoundException if address is not found', async () => {
      prisma.customer_addresses.findFirst.mockResolvedValue(null);
      await expect(service.findOne('c-1', 'addr-missing')).rejects.toThrow(NotFoundException);
    });
  });
});
