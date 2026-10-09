# API Contract

## 1. Get Today Summary
- **Method:** `GET`
- **Route:** `api/expenses/today`
- **Headers:** `X-Telegram-Init-Data`
- **Request Body:** None
- **Response Shape:**
```json
{
  "total": 150000,
  "expenses": [
    {
      "id": 1,
      "category": "Food",
      "amount": 50000,
      "note": "Lunch",
      "createdAt": "2023-10-25T12:00:00Z"
    }
  ]
}
```

## 2. Get Month Summary
- **Method:** `GET`
- **Route:** `api/expenses/month`
- **Headers:** `X-Telegram-Init-Data`
- **Request Body:** None
- **Response Shape:**
```json
[
  {
    "category": "Food",
    "totalAmount": 450000
  },
  {
    "category": "Transport",
    "totalAmount": 120000
  }
]
```

## 3. Add Expense
- **Method:** `POST`
- **Route:** `api/expenses`
- **Headers:** `X-Telegram-Init-Data`, `Content-Type: application/json`
- **Request Body:** `ExpenseCreateDto`
```json
{
  "amount": 50000,
  "category": "Food",
  "note": "Lunch"
}
```
- **Response Shape:** 200 OK (returns `ExpenseGetDto` originally, but frontend only checks `IsSuccessStatusCode`)

## 4. Delete Expense
- **Method:** `DELETE`
- **Route:** `api/expenses/{id}`
- **Headers:** `X-Telegram-Init-Data`
- **Request Body:** None
- **Response Shape:** 200 OK (frontend only checks `IsSuccessStatusCode`)
