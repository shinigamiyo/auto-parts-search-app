import { useCallback, useState } from 'react'
import './App.css'

const initialStatus = {
  type: 'idle',
  message: 'Введите артикул и нажмите «Найти».',
}

function App() {
  const [code, setCode] = useState('')
  const [items, setItems] = useState([])
  const [status, setStatus] = useState(initialStatus)

  const search = useCallback(
    async (searchCode) => {
      const trimmed = searchCode.trim()
      if (!trimmed) {
        setItems([])
        setStatus({
          type: 'idle',
          message: 'Введите артикул и нажмите «Найти».',
        })
        return
      }

      setStatus({ type: 'loading', message: 'Загрузка...' })

      try {
        const response = await fetch(`/api/search/${encodeURIComponent(trimmed)}`)
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          const errorMessage = payload.message || 'Не удалось выполнить поиск'
          throw new Error(errorMessage)
        }

        const payload = await response.json()
        const data = Array.isArray(payload.items) ? payload.items : []
        setItems(data)

        if (data.length === 0) {
          setStatus({ type: 'empty', message: 'Ничего не найдено' })
        } else {
          setStatus({ type: 'success', message: `Найдено ${data.length} позиций` })
        }
      } catch (error) {
        const message =
          error instanceof Error && error.message
            ? error.message
            : 'Произошла ошибка. Попробуйте ещё раз'

        setStatus({ type: 'error', message })
      }
    },
    []
  )

  const handleSubmit = useCallback(
    (event) => {
      event.preventDefault()
      search(code)
    },
    [code, search]
  )

  const handleInputChange = (event) => {
    setCode(event.target.value)
  }

  const isLoading = status.type === 'loading'

  return (
    <div className="page">
      <header className="hero">
        <h1>Поиск автозапчастей</h1>
        <p>Введите артикул детали и получите список доступных позиций.</p>
      </header>

      <form className="search" onSubmit={handleSubmit}>
        <label className="search__label" htmlFor="search-code">
          Артикул
        </label>
        <div className="search__controls">
          <input
            id="search-code"
            type="text"
            value={code}
            onChange={handleInputChange}
            placeholder="Например, 4477 или OC90"
            autoComplete="off"
            className="search__input"
            disabled={isLoading}
          />
          <button
            type="submit"
            className="search__button"
            disabled={isLoading || code.trim().length === 0}
          >
            {isLoading ? 'Поиск...' : 'Найти'}
          </button>
        </div>
      </form>

      <div className={`status status--${status.type}`} role="status">
        {status.message}
      </div>

      {items.length > 0 && (
        <div className="table-wrapper">
          <table className="results">
            <thead>
              <tr>
                <th>ID</th>
                <th>Артикул</th>
                <th>Производитель</th>
                <th>Наименование</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.id}</td>
                  <td>{item.article}</td>
                  <td>{item.manufacturer}</td>
                  <td>{item.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default App
