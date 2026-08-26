import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

// bcrypt and Prisma both need the Node runtime — not the edge.
export const runtime = "nodejs";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
