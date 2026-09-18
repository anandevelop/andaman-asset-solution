-- CreateTable
CREATE TABLE "_UserProjectScope" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_UserProjectScope_AB_unique" ON "_UserProjectScope"("A", "B");

-- CreateIndex
CREATE INDEX "_UserProjectScope_B_index" ON "_UserProjectScope"("B");

-- AddForeignKey
ALTER TABLE "_UserProjectScope" ADD CONSTRAINT "_UserProjectScope_A_fkey" FOREIGN KEY ("A") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserProjectScope" ADD CONSTRAINT "_UserProjectScope_B_fkey" FOREIGN KEY ("B") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
