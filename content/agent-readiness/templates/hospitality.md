# Agent-Ready Schema for Hospitality

The most consequential agent task surface for hotels, B&Bs, vacation
rentals, restaurants, tours, and event venues is the *reservation*.
Any property whose booking flow is exposed as a structured
`ReserveAction` will capture agent-driven bookings. Properties that
ride entirely on third-party widgets (OpenTable, Resy, Booking.com)
will see their bookings flow through the widget's brand instead.

## ReserveAction: hotel room booking

Goes on the property's dedicated booking page.

```json
{
  "@context": "https://schema.org",
  "@type": "ReserveAction",
  "name": "Book a Room",
  "description": "Direct booking. No third-party fees. Best Rate Guarantee.",
  "target": {
    "@type": "EntryPoint",
    "urlTemplate": "https://www.example-hotel.com/book?checkin={checkin}&checkout={checkout}&guests={guests}&source=agent",
    "actionPlatform": [
      "https://schema.org/DesktopWebPlatform",
      "https://schema.org/MobileWebPlatform"
    ],
    "httpMethod": "GET"
  },
  "query-input": [
    {
      "@type": "PropertyValueSpecification",
      "valueName": "checkin",
      "valueRequired": true,
      "valuePattern": "\\d{4}-\\d{2}-\\d{2}"
    },
    {
      "@type": "PropertyValueSpecification",
      "valueName": "checkout",
      "valueRequired": true,
      "valuePattern": "\\d{4}-\\d{2}-\\d{2}"
    },
    {
      "@type": "PropertyValueSpecification",
      "valueName": "guests",
      "valueRequired": true,
      "minValue": 1,
      "maxValue": 8
    }
  ],
  "object": {
    "@type": "LodgingBusiness",
    "@id": "https://www.example-hotel.com/#organization"
  },
  "result": {
    "@type": "LodgingReservation",
    "reservationStatus": "Pending"
  }
}
```

### Implementation notes

- The `urlTemplate` must accept the agent-passed parameters and
  return a usable booking page (or a structured response) when
  hit directly.
- `query-input` is the single most important field for agents.
  Without it the agent does not know what data to provide.
- `valuePattern` for dates uses ISO 8601, the standard agents expect.

## ReserveAction: restaurant table

Goes on the restaurant page or contact page.

```json
{
  "@context": "https://schema.org",
  "@type": "ReserveAction",
  "name": "Reserve a Table",
  "description": "Direct restaurant reservations. We hold tables 15 minutes past your booking time.",
  "target": {
    "@type": "EntryPoint",
    "urlTemplate": "https://www.example-restaurant.com/reserve?date={date}&time={time}&party={party}&source=agent",
    "httpMethod": "GET"
  },
  "query-input": [
    {
      "@type": "PropertyValueSpecification",
      "valueName": "date",
      "valueRequired": true,
      "valuePattern": "\\d{4}-\\d{2}-\\d{2}"
    },
    {
      "@type": "PropertyValueSpecification",
      "valueName": "time",
      "valueRequired": true,
      "valuePattern": "\\d{2}:\\d{2}"
    },
    {
      "@type": "PropertyValueSpecification",
      "valueName": "party",
      "valueRequired": true,
      "minValue": 1,
      "maxValue": 12
    }
  ],
  "object": {
    "@type": "FoodEstablishment",
    "@id": "https://www.example-restaurant.com/#organization"
  },
  "result": {
    "@type": "FoodEstablishmentReservation",
    "reservationStatus": "Pending"
  }
}
```

## ReserveAction: tour or activity

For boat tours, helicopter rides, snorkeling, hiking, ATV rentals,
spa appointments, surf lessons.

```json
{
  "@context": "https://schema.org",
  "@type": "ReserveAction",
  "name": "Book a Tour",
  "target": {
    "@type": "EntryPoint",
    "urlTemplate": "https://www.example-tour.com/book?date={date}&participants={participants}&tour={tourId}&source=agent",
    "httpMethod": "GET"
  },
  "query-input": [
    { "@type": "PropertyValueSpecification", "valueName": "date", "valueRequired": true, "valuePattern": "\\d{4}-\\d{2}-\\d{2}" },
    { "@type": "PropertyValueSpecification", "valueName": "participants", "valueRequired": true, "minValue": 1, "maxValue": 10 },
    { "@type": "PropertyValueSpecification", "valueName": "tourId", "valueRequired": true }
  ],
  "object": {
    "@type": "TouristAttraction",
    "@id": "https://www.example-tour.com/#organization"
  },
  "result": {
    "@type": "EventReservation",
    "reservationStatus": "Pending"
  }
}
```

## What to NEVER expose

- **Reservation actions where bookings cannot actually be confirmed
  in real time.** If the booking flow is "we will call you within 24
  hours" do not expose ReserveAction. Agents will report failure to
  the user and you lose the booking entirely.
- **Cancellation policies that vary by booking source via the
  schema.** If agent-driven bookings have different cancellation
  rules than direct human bookings, surface that on the *result*
  page, not the schema. Hidden policy variation is a fast path to
  bad-faith dispute.
- **Reservations for capacity you do not have.** A real-time
  inventory feed is the prerequisite. If the schema says "Book a
  Room" but the hotel is sold out, the agent's failure is your
  reputation hit.

## What to expose alongside

- **Cancellation window** as a `cancellationPolicy` on the
  `LodgingReservation` result type
- **Best Rate Guarantee** as a `priceMatchPolicy` on the
  Organization
- **Pet policy, age policy, smoking policy** as
  `LocationFeatureSpecification` on the LodgingBusiness

The agent ecosystem in 2026 is starting to filter on these fields.
A pet-friendly traveler asking ChatGPT for "pet-friendly Honolulu
hotels with same-day booking" will reach properties that surface
the pet policy in structured form before properties whose policy is
buried in unstructured text.
