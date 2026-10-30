import { defineConfig } from "vite"

// Relative asset paths: itch.io serves the build from a subfolder of its game host.
export default defineConfig({ base: "./" })
