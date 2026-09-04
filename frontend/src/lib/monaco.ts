import { loader } from '@guolao/vue-monaco-editor'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import 'monaco-editor/esm/vs/editor/editor.all'
import 'monaco-editor/esm/vs/basic-languages/css/css.contribution'
import 'monaco-editor/esm/vs/basic-languages/html/html.contribution'
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution'
import 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'

// Highlighting only — the language services would flag the generated app's globals.
self.MonacoEnvironment = { getWorker: () => new editorWorker() }

loader.config({ monaco })
