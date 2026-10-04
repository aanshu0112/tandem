import { ROUTES } from "./data";
import { fracNear } from "./lib";

export const A = ROUTES.A.points;
export const B = ROUTES.B.points;
export const ALL = [...A, ...B];
export const START = A[0];
export const END = A[A.length - 1];

export const stairs = ROUTES.A.flags[0];
export const steep = ROUTES.B.flags[0];
export const cracked = ROUTES.B.flags[1];

export const stairsFrac = fracNear(A, stairs.x, stairs.y);
export const steepFrac = fracNear(B, steep.x, steep.y);
export const crackedFrac = fracNear(B, cracked.x, cracked.y);
