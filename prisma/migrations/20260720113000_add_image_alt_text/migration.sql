ALTER TABLE "categories" ADD COLUMN "image_alt_text" TEXT;
ALTER TABLE "product_images" ADD COLUMN "alt_text" TEXT;
ALTER TABLE "variant_images" ADD COLUMN "alt_text" TEXT;
ALTER TABLE "banners" ADD COLUMN "alt_text" TEXT;
