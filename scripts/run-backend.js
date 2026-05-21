const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const backendDir = path.resolve(__dirname, "..", "backend");
const venvDir = path.join(backendDir, ".venv");
const win = process.platform === "win32";

const venvPython = win
  ? path.join(venvDir, "Scripts", "python.exe")
  : path.join(venvDir, "bin", "python");

const venvScripts = win
  ? path.join(venvDir, "Scripts")
  : path.join(venvDir, "bin");

const executable = fs.existsSync(venvPython) ? venvPython : win ? "python" : "python3";

// Ativa o venv no PATH para que processos filhos (multiprocessing/--reload)
// também usem o Python correto
const env = {
  ...process.env,
  VIRTUAL_ENV: venvDir,
  PATH: venvScripts + path.delimiter + (process.env.PATH || ""),
  // Remove PYTHONHOME se existir — interfere com o venv
  PYTHONHOME: undefined,
};

const child = spawn(
  executable,
  ["-m", "uvicorn", "app.main:app", "--reload", "--host", "127.0.0.1", "--port", "8000"],
  { cwd: backendDir, stdio: "inherit", env }
);

child.on("exit", (code) => process.exit(code ?? 1));
