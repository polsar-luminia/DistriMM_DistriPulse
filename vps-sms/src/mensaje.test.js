const test = require("node:test");
const assert = require("node:assert");
const { construirMensaje, sanitizarGsm } = require("./mensaje");

// Forzar UCS-2 requiere algun caracter > 0x7f. Verificamos que el resultado
// sea ASCII puro (asi LabsMobile lo manda como GSM-7).
function esAscii(str) {
  return [...str].every((c) => c.charCodeAt(0) <= 0x7f);
}

test("vencido: saldo pendiente + identificacion + numero", () => {
  const m = construirMensaje({ tipo: "morosos", nombre: "Pedro" });
  assert.match(
    m,
    /^Hola, querid@ Pedro\. Almacen Agropecuario DistriMM te recuerda que tienes un saldo pendiente\./,
  );
  assert.match(m, /Escribenos al WhatsApp 3223806883/);
  assert.match(m, /Para nosotros es valioso contar con tu apoyo\.$/);
});

test("cobro: saldo proximo a vencer", () => {
  const m = construirMensaje({ tipo: "cobro", nombre: "Ana" });
  assert.match(m, /tienes un saldo proximo a vencer/);
  assert.match(m, /Escribenos al WhatsApp 3223806883/);
});

test("conserva @ y queda ASCII (GSM-7), quita tildes/enie del nombre", () => {
  const conTildes =
    "JES" + String.fromCharCode(0x00da) + "S MU" + String.fromCharCode(0x00d1) + "OZ"; // JESÚS MUÑOZ
  const m = construirMensaje({ tipo: "morosos", nombre: conTildes });
  assert.ok(esAscii(m), "el mensaje debe quedar ASCII tras sanitizar");
  assert.match(m, /querid@ JESUS MUNOZ/);
});

test("sanitizarGsm normaliza espacios no separables", () => {
  const nbsp = String.fromCharCode(0x00a0);
  const narrow = String.fromCharCode(0x202f);
  const total = "$" + nbsp + "2.500.000" + narrow + "COP";
  const limpio = sanitizarGsm(total);
  assert.ok(esAscii(limpio), "no debe quedar ningun espacio Unicode");
  assert.strictEqual(limpio, "$ 2.500.000 COP");
});
