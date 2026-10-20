describe('eCommerce Pricing, Cart & Coupon Calculation Tests', () => {
  describe('Cart & Pricing Formulas', () => {
    it('calculates item subtotal accurately across multiple quantities', () => {
      const items = [
        { price: 420.0, discounted_price: 350.0, quantity: 2 },
        { price: 150.0, discounted_price: 150.0, quantity: 1 },
      ];

      const originalTotal = items.reduce((acc, it) => acc + it.price * it.quantity, 0);
      const discountedSubtotal = items.reduce((acc, it) => acc + it.discounted_price * it.quantity, 0);

      expect(originalTotal).toBe(990.0);
      expect(discountedSubtotal).toBe(850.0);
    });

    it('applies percentage coupon discount correctly with rounding', () => {
      const subtotal = 850.0;
      const coupon = {
        discount_type: 'PERCENTAGE' as const,
        discount_value: 15, // 15%
      };

      const discountAmount = Number(((subtotal * coupon.discount_value) / 100).toFixed(2));
      const finalTotal = Math.max(0, Number((subtotal - discountAmount).toFixed(2)));

      expect(discountAmount).toBe(127.5);
      expect(finalTotal).toBe(722.5);
    });

    it('applies fixed amount coupon discount capped at subtotal', () => {
      const subtotal = 100.0;
      const coupon = {
        discount_type: 'FIXED_AMOUNT' as const,
        discount_value: 150.0, // greater than subtotal
      };

      const discountAmount = Math.min(subtotal, coupon.discount_value);
      const finalTotal = Math.max(0, subtotal - discountAmount);

      expect(discountAmount).toBe(100.0);
      expect(finalTotal).toBe(0.0);
    });

    it('rejects coupon when subtotal is below minimum purchase requirement', () => {
      const subtotal = 200.0;
      const coupon = {
        minimum_amount: 300.0,
        discount_value: 50.0,
      };

      const isEligible = subtotal >= coupon.minimum_amount;
      expect(isEligible).toBe(false);
    });
  });

  describe('Currency Conversion Logic', () => {
    it('converts prices properly with exchange rate multipliers', () => {
      const baseAedPrice = 1000.0;
      const rates: Record<string, number> = {
        AED: 1,
        USD: 0.2723,
        GBP: 0.2043,
        EUR: 0.2426,
      };

      const usdPrice = Number((baseAedPrice * rates.USD).toFixed(2));
      const gbpPrice = Number((baseAedPrice * rates.GBP).toFixed(2));
      const eurPrice = Number((baseAedPrice * rates.EUR).toFixed(2));

      expect(usdPrice).toBe(272.3);
      expect(gbpPrice).toBe(204.3);
      expect(eurPrice).toBe(242.6);
    });
  });

  describe('Stock & Inventory Validation', () => {
    it('detects out of stock items when requested quantity exceeds available quantity', () => {
      const variant = {
        id: 'var-1',
        available_stock: 3,
      };
      const requestedQty = 5;
      const isOutOfStock = requestedQty > variant.available_stock;
      expect(isOutOfStock).toBe(true);
    });

    it('prevents duplicate items in cart by merging quantities instead of appending', () => {
      const cart = [
        { id: 'var-1', quantity: 2 },
        { id: 'var-2', quantity: 1 },
      ];
      const newItem = { id: 'var-1', quantity: 3 };

      const existingIndex = cart.findIndex((it) => it.id === newItem.id);
      if (existingIndex > -1) {
        cart[existingIndex].quantity += newItem.quantity;
      } else {
        cart.push(newItem);
      }

      expect(cart.length).toBe(2);
      expect(cart[0].quantity).toBe(5);
    });
  });
});
