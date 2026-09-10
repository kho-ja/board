import type { MarkdownComponents } from '@tanstack/markdown/react'

type HProps = { className?: string; children?: React.ReactNode }
type CodeProps = {
  className?: string
  children?: React.ReactNode
}

function h1(props: HProps) {
  return (
    <h1 className="md-h1" {...props}>
      {props.children}
    </h1>
  )
}
function h2(props: HProps) {
  return (
    <h2 className="md-h2" {...props}>
      {props.children}
    </h2>
  )
}
function h3(props: HProps) {
  return (
    <h3 className="md-h3" {...props}>
      {props.children}
    </h3>
  )
}
function para(props: HProps) {
  return (
    <p className="md-p" {...props}>
      {props.children}
    </p>
  )
}
function ul(props: HProps) {
  return (
    <ul className="md-ul" {...props}>
      {props.children}
    </ul>
  )
}
function ol(props: HProps) {
  return (
    <ol className="md-ol" {...props}>
      {props.children}
    </ol>
  )
}
function li(props: HProps) {
  return (
    <li className="md-li" {...props}>
      {props.children}
    </li>
  )
}
function blockquote(props: HProps) {
  return (
    <blockquote className="md-blockquote" {...props}>
      {props.children}
    </blockquote>
  )
}
function pre(props: HProps) {
  return (
    <pre className="md-pre" {...props}>
      {props.children}
    </pre>
  )
}
function code(props: CodeProps) {
  return (
    <code className="md-code" {...props}>
      {props.children}
    </code>
  )
}
function link(props: HProps & { href?: string }) {
  return (
    <a className="md-a" {...props}>
      {props.children}
    </a>
  )
}
function strong(props: HProps) {
  return (
    <strong className="md-strong" {...props}>
      {props.children}
    </strong>
  )
}
function em(props: HProps) {
  return (
    <em className="md-em" {...props}>
      {props.children}
    </em>
  )
}
function hrule(props: HProps) {
  return <hr className="md-hr" {...props} />
}

export const markdownComponents = {
  h1,
  h2,
  h3,
  h4: h3,
  h5: h3,
  h6: h3,
  p: para,
  ul,
  ol,
  li,
  blockquote,
  pre,
  code,
  a: link,
  strong,
  em,
  hr: hrule,
} satisfies MarkdownComponents