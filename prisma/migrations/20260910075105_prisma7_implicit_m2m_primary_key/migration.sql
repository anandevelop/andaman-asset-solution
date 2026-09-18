-- AlterTable
ALTER TABLE "_UserProjectScope" ADD CONSTRAINT "_UserProjectScope_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_UserProjectScope_AB_unique";
