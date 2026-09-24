import dotenv from 'dotenv';
dotenv.config();

import { obfuscatePath, deobfuscatePath } from '../src/lib/cipher';

async function main() {
  const original = 'english/Class_10/Student_Photos/MES2026-00010.jpg';
  console.log("Original path:", original);
  
  const token = obfuscatePath(original);
  console.log("Obfuscated token:", token);
  
  const decrypted = deobfuscatePath(token);
  console.log("Decrypted path:", decrypted);
  
  if (original === decrypted) {
    console.log("Cipher works perfectly!");
  } else {
    console.error("Cipher mismatch!");
  }
}

main();
