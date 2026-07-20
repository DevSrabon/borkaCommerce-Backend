describe('eCommerce Offer Pricing Calculations', () => {
  it('should select highest priority active offer correctly', () => {
    const basePrice = 250.00;
    
    // List of overlapping active offers on a product variant
    const offers = [
      { name: 'Eid Sale 2026', priority: 50, discount_type: 'PERCENTAGE', discount_value: 15 },
      { name: 'Eid Eve Flash Sale', priority: 100, discount_type: 'PERCENTAGE', discount_value: 20 },
      { name: 'Luxury Promo', priority: 10, discount_type: 'FIXED_AMOUNT', discount_value: 50 },
    ];
    
    // Order offers by highest priority descending
    offers.sort((a, b) => b.priority - a.priority);
    const topOffer = offers[0];
    
    expect(topOffer.name).toBe('Eid Eve Flash Sale');
    
    // Compute price
    let finalPrice = basePrice;
    if (topOffer.discount_type === 'PERCENTAGE') {
      finalPrice = finalPrice * (1 - topOffer.discount_value / 100);
    } else {
      finalPrice = Math.max(0, finalPrice - topOffer.discount_value);
    }
    
    expect(finalPrice).toBe(200.00); // 250 AED - 20% = 200 AED
  });

  it('should compute fixed amount discounts correctly', () => {
    const basePrice = 450.00;
    const topOffer = { name: 'Fixed Discount', priority: 10, discount_type: 'FIXED_AMOUNT', discount_value: 100 };
    
    let finalPrice = basePrice;
    if (topOffer.discount_type === 'PERCENTAGE') {
      finalPrice = finalPrice * (1 - topOffer.discount_value / 100);
    } else {
      finalPrice = Math.max(0, finalPrice - topOffer.discount_value);
    }
    
    expect(finalPrice).toBe(350.00); // 450 AED - 100 AED = 350 AED
  });
});
