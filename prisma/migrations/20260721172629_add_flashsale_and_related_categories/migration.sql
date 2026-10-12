-- AlterTable
ALTER TABLE "products" ADD COLUMN     "tags" TEXT;

-- CreateTable
CREATE TABLE "offer_categories" (
    "offer_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,

    CONSTRAINT "offer_categories_pkey" PRIMARY KEY ("offer_id","category_id")
);

-- CreateTable
CREATE TABLE "product_related_categories" (
    "product_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,

    CONSTRAINT "product_related_categories_pkey" PRIMARY KEY ("product_id","category_id")
);

-- RenameForeignKey
ALTER TABLE "accounts" RENAME CONSTRAINT "accounts_customerId_fkey" TO "accounts_customer_id_fkey";

-- RenameForeignKey
ALTER TABLE "sessions" RENAME CONSTRAINT "sessions_customerId_fkey" TO "sessions_customer_id_fkey";

-- AddForeignKey
ALTER TABLE "offer_categories" ADD CONSTRAINT "offer_categories_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_categories" ADD CONSTRAINT "offer_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_related_categories" ADD CONSTRAINT "product_related_categories_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_related_categories" ADD CONSTRAINT "product_related_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
