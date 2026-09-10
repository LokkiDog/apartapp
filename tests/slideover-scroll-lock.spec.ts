import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NodeTypes, baseParse, parserOptions } from '@vue/compiler-dom'
import { parse } from '@vue/compiler-sfc'
import { describe, expect, it } from 'vitest'

function vueFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? vueFiles(path) : entry.name.endsWith('.vue') ? [path] : []
  })
}

describe('slideover scroll locking', () => {
  it('keeps every slideover modal with an overlay', () => {
    const slideovers: Array<{ file: string, modal?: string, overlay?: string }> = []

    for (const file of vueFiles('src')) {
      const template = parse(readFileSync(file, 'utf8')).descriptor.template?.content
      if (!template) continue

      const visit = (node: ReturnType<typeof baseParse>['children'][number]) => {
        if (node.type === NodeTypes.ELEMENT) {
          if (node.tag === 'USlideover') {
            const boundValue = (name: string) => {
              const prop = node.props.find(prop =>
                prop.type === NodeTypes.DIRECTIVE
                && prop.name === 'bind'
                && prop.arg?.type === NodeTypes.SIMPLE_EXPRESSION
                && prop.arg.content === name,
              )
              return prop?.type === NodeTypes.DIRECTIVE ? prop.exp?.loc.source : undefined
            }
            slideovers.push({
              file,
              modal: boundValue('modal'),
              overlay: boundValue('overlay'),
            })
          }
          node.children.forEach(visit)
        }
      }

      baseParse(template, parserOptions).children.forEach(visit)
    }

    expect(slideovers.length).toBeGreaterThan(0)
    expect(slideovers.filter(slideover => slideover.modal !== 'true')).toEqual([])
    expect(slideovers.filter(slideover => slideover.overlay !== 'true')).toEqual([])
  })

  it('contains scrolling inside the slideover body', () => {
    const config = readFileSync('app/app.config.ts', 'utf8')
    expect(config).toContain("slideover: { slots: { content: 'overflow-hidden', body: 'min-h-0 overscroll-contain' } }")
  })
})
