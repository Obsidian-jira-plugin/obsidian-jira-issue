import esbuild from "esbuild"
import process from "process"
import { builtinModules as builtins } from "node:module"

const prod = (process.argv[2] === 'production')

esbuild.build({
  banner: {
    js: '/* Project: https://github.com/Obsidian-jira-plugin/obsidian-jira-issue */',
  },
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: [
    'obsidian',
    'electron',
    '@codemirror/autocomplete',
    '@codemirror/closebrackets',
    '@codemirror/collab',
    '@codemirror/commands',
    '@codemirror/comment',
    '@codemirror/fold',
    '@codemirror/gutter',
    '@codemirror/highlight',
    '@codemirror/history',
    '@codemirror/language',
    '@codemirror/lint',
    '@codemirror/matchbrackets',
    '@codemirror/panel',
    '@codemirror/rangeset',
    '@codemirror/rectangular-selection',
    '@codemirror/search',
    '@codemirror/state',
    '@codemirror/stream-parser',
    '@codemirror/text',
    '@codemirror/tooltip',
    '@codemirror/view',
    ...builtins],
  format: 'cjs',
  watch: !prod,
  target: 'es2020',
  logLevel: "info",
  sourcemap: prod ? false : 'inline',
  treeShaking: true,
  outfile: 'main.js',
}).catch(() => process.exit(1))
