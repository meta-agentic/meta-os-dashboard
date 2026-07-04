import React from 'react'
import Card from './Card.jsx'

export default function Activity({ data }) {
  return (
    <Card title="Vault activity" data={data}>
      <ul className="feed">
        {data?.commits?.map((c) => (
          <li key={c.hash}>
            <span className="mono dim">{c.hash}</span> {c.subject}
            <span className="dim small"> · {new Date(c.date).toLocaleDateString()}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
