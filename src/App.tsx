import { useState } from "react";
export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [columnCount, setColumnCount] = useState(0);
  const [rows, setRows] = useState<string[][]>([])
  const rowCount = rows.length
  const [dleName, setDleName] = useState("");
  const [categoryNames, setCategoryNames] = useState<string[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
if (window.location.pathname === "/create") {
  return (
    <main>
      <form onSubmit={(event) =>{
        event.preventDefault()
        const fields = new FormData(event.currentTarget)
        setDleName(String(fields.get('dle-name') ?? '').trim())
        setColumnCount(Number(fields.get("number-of-categories")))
      }}>
        <div>
        <label htmlFor="dle-name">DLE Name:</label>
        <input type="text" id="dle-name" name="dle-name" />
        </div>
        <div>
        <label htmlFor="number-of-categories">Number Of Categories:</label>
        <input type="number" id="number-of-categories" name="number-of-categories" />
        </div>
        <div>
        <button
          type="submit"> Generate Table
        </button>
        </div>
      </form>
      {dleName !== ''&& <h2>{dleName}</h2>}
      {columnCount > 0 && (
        <div className="dle-table-layout">
        <table className="dle-table">
          <thead>
            <tr>
              {Array.from({ length: columnCount }, (_, index) => (
                <th scope="col" key={index}>
                  {categoryNames[index] && editingIndex !== index ? (
                    <button type="button"
                    className="category-name-button"
                    onClick={() => setEditingIndex(index)}>
                      {categoryNames[index]}
                    </button>
                    ) : (
                      <input
                      type="text"
                      placeholder="category name"
                      aria-label={`category ${index+1} name`}
                      defaultValue={categoryNames[index] ?? ''}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          const name = event.currentTarget.value.trim()
                          if (name === '') return

                          const nextNames = [...categoryNames]
                          nextNames[index] = name
                          setCategoryNames(nextNames)
                          setEditingIndex(null)
                        }
                      }}
                      />
                    )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
              {Array.from({ length: rowCount }, (_, row) => (
                <tr key={row}>
                {Array.from({ length: columnCount }, (_, col) => {
                  let cellValue = ''

                  if(rows[row] !== undefined && rows[row][col] !== undefined) {
                    cellValue = rows[row][col]
                  }
                return (
                  <td key={col}>
                    <input type="text" aria-label={`Character ${row+1}, Category ${col+1} value`}
                    value={cellValue}
                    onChange={(event) => {
                      const value = event.currentTarget.value

                      setRows(currentRows => currentRows.map((cells, rowIndex) => {
                        if (rowIndex !== row) return cells

                        const nextCells = [...cells]
                        nextCells[col] = value
                        return nextCells
                      }))
                    }}
                    />
                  </td>
                )
              })}
            </tr>
            ))}
          </tbody>
        </table>
          <button type="button" onClick={() => setRows(currentRows => [...currentRows,
            Array.from({ length: columnCount }, () => ''),
          ])}>
          Add Character
          </button>
          <button type="button" onClick={() => setRows(currentRows => currentRows.slice(0, -1))}>
          Remove Character
          </button>
          </div>
        )}
        <div>
        <button className="save-dle-button"
        type="button" onClick={async () => {
          const dle = {
            name: dleName,
            categories: categoryNames,
            characters: rows,
          }
          try {
            const response = await fetch('/dles', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(dle),
            })

            if (!response.ok) {
              throw new Error('The backend could not receive the DLE')
              }
              const result = await response.json()
              console.log(result.message)
            } catch (error) {
              console.error('Could not send the DLE:', error)
            }
          }}
        >Save DLE</button>
          </div>
    </main>
  )
}
  return (
      <main>
        <h1>DLEMaker</h1>
        <p>Welcome to DLEMaker! <br/> A website that allows you to create your own DLE
        </p>
        <button 
        onClick={() => setIsLoggedIn(true)} 
        type="button" 
        className="log-in-button">
        Log In
        </button>
        <button 
        type="button" 
        className="register-button">
        Register
        </button>
        {isLoggedIn && <a href="/create">Create A DLE</a>}

      </main>
  );
}