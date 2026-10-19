import { readFileSync } from "node:fs";
import { hashPassword } from "../src/lib/auth";

console.log(hashPassword(readFileSync(0, "utf8").replace(/\r?\n$/, "")));
