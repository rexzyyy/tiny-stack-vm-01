import * as fs from "node:fs";
import * as path from "node:path";

const src = process.env.MAKEFUN_INPUT_DIR ?? "/input";
const dst = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";

for (const id of fs.readdirSync(src).filter(n => fs.statSync(path.join(src, n)).isDirectory()).sort()) {
  const dir = path.join(src, id);
  const code = fs.readFileSync(path.join(dir, "program.bin"));
  const input = fs.readFileSync(path.join(dir, "input.bin"));
  const stack = new Int32Array(256), calls = new Int32Array(64), mem = new Int32Array(256);
  const out: number[] = [];
  let sp = 0, cp = 0, ip = 0, pc = 0, steps = 0, exit = 9;
  while (true) {
    if (steps === 1000000) { exit = 10; break; }
    if (pc < 0 || pc >= code.length) { exit = 9; break; }
    const op = code[pc];
    let imm = 0, pops = 0, pushes = 0;
    switch (op) {
      case 0x00: break;
      case 0x01: imm = 1; pushes = 1; break;
      case 0x02: imm = 4; pushes = 1; break;
      case 0x03: pops = 1; break;
      case 0x04: pops = 1; pushes = 2; break;
      case 0x05: pops = 2; pushes = 2; break;
      case 0x06: pops = 2; pushes = 3; break;
      case 0x07: pops = 3; pushes = 3; break;
      case 0x10: case 0x11: case 0x12: case 0x13: case 0x14: case 0x15: case 0x16:
      case 0x18: case 0x19: case 0x1a: case 0x1c: case 0x1d: case 0x1e:
      case 0x20: case 0x21: case 0x22: pops = 2; pushes = 1; break;
      case 0x17: case 0x1b: case 0x40: pops = 1; pushes = 1; break;
      case 0x30: imm = 2; break;
      case 0x31: case 0x32: imm = 2; pops = 1; break;
      case 0x33: imm = 2; break;
      case 0x34: break;
      case 0x41: pops = 2; break;
      case 0x50: case 0x51: case 0x53: pops = 1; break;
      case 0x52: pushes = 1; break;
      default: exit = 5; break;
    }
    if (exit === 5) break;
    if (pc + 1 + imm > code.length) { exit = 9; break; }
    const next = pc + 1 + imm;
    if (sp < pops) { exit = 2; break; }
    if (sp - pops + pushes > 256) { exit = 3; break; }
    steps++;
    if (op === 0x00) { exit = 0; break; }
    pc = next;
    let a: number, b: number, v: number;
    switch (op) {
      case 0x01: stack[sp++] = (code[next - 1] << 24) >> 24; break;
      case 0x02: stack[sp++] = code.readInt32LE(pc - 4); break;
      case 0x03: sp--; break;
      case 0x04: stack[sp] = stack[sp - 1]; sp++; break;
      case 0x05: a = stack[sp - 1]; stack[sp - 1] = stack[sp - 2]; stack[sp - 2] = a; break;
      case 0x06: stack[sp] = stack[sp - 2]; sp++; break;
      case 0x07: a = stack[sp - 3]; stack[sp - 3] = stack[sp - 2]; stack[sp - 2] = stack[sp - 1]; stack[sp - 1] = a; break;
      case 0x10: case 0x11: case 0x12: case 0x13: case 0x14: case 0x15: case 0x16:
      case 0x18: case 0x19: case 0x1a: case 0x1c: case 0x1d: case 0x1e:
      case 0x20: case 0x21: case 0x22:
        a = stack[sp - 2]; b = stack[sp - 1];
        if ((op === 0x13 || op === 0x14 || op === 0x15 || op === 0x16) && b === 0) { exit = 4; break; }
        if (op === 0x10) v = a + b;
        else if (op === 0x11) v = a - b;
        else if (op === 0x12) v = Math.imul(a, b);
        else if (op === 0x13) v = a === -2147483648 && b === -1 ? a : Math.trunc(a / b);
        else if (op === 0x14) v = a % b;
        else if (op === 0x15) v = (a >>> 0) / (b >>> 0) | 0;
        else if (op === 0x16) v = (a >>> 0) % (b >>> 0);
        else if (op === 0x18) v = a & b;
        else if (op === 0x19) v = a | b;
        else if (op === 0x1a) v = a ^ b;
        else if (op === 0x1c) v = a << (b & 31);
        else if (op === 0x1d) v = a >> (b & 31);
        else if (op === 0x1e) v = a >>> (b & 31);
        else if (op === 0x20) v = +(a === b);
        else if (op === 0x21) v = +(a < b);
        else v = +((a >>> 0) < (b >>> 0));
        stack[sp - 2] = v; sp--; break;
      case 0x17: stack[sp - 1] = -stack[sp - 1]; break;
      case 0x1b: stack[sp - 1] = ~stack[sp - 1]; break;
      case 0x30: case 0x31: case 0x32: {
        const rawOffset = code[pc - 2] | (code[pc - 1] << 8);
        const jumpOffset = (rawOffset << 16) >> 16;
        let shouldJump = true;
        if (op === 0x31) shouldJump = stack[--sp] === 0;
        else if (op === 0x32) shouldJump = stack[--sp] !== 0;
        if (shouldJump) pc = next + jumpOffset;
        break;
      }
      case 0x33:
        if (cp === 64) { exit = 7; break; }
        calls[cp++] = next; pc = code[pc - 2] | (code[pc - 1] << 8); break;
      case 0x34:
        if (cp === 0) { exit = 8; break; }
        pc = calls[--cp]; break;
      case 0x40:
        a = stack[--sp]; if (a < 0 || a > 255) { exit = 6; break; } stack[sp++] = mem[a]; break;
      case 0x41:
        a = stack[sp - 1]; b = stack[sp - 2];
        if (a < 0 || a > 255) { exit = 6; break; } mem[a] = b; sp -= 2; break;
      case 0x50: case 0x51:
        v = stack[sp - 1];
        const bytes = op === 0x50 ? Buffer.from(String(v), "ascii") : Buffer.from([v & 255]);
        if (out.length + bytes.length > 65536) { exit = 11; break; }
        for (const byte of bytes) out.push(byte);
        sp--; break;
      case 0x52: stack[sp++] = ip < input.length ? input[ip++] : -1; break;
      case 0x53: exit = stack[--sp] & 255; break;
    }
    if (op === 0x53 || exit === 4 || exit === 6 || exit === 7 || exit === 8 || exit === 11) break;
  }
  const target = path.join(dst, id);
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, "stdout.bin"), Buffer.from(out));
  fs.writeFileSync(path.join(target, "exit.txt"), String(exit) + "\n");
}
