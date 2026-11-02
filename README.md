# Netflix Catalogue Visualization

Web application for visualizing and exploring the Netflix catalogue using **D3.js**.

## Technologies

* JavaScript
* HTML / CSS
* D3.js
* Vite
* npm

## Requirements

Make sure you have **Node.js** and **npm** installed.

Check your installation with:

```bash
node --version
npm --version
```

## Installation

Clone the repository:

```bash
git clone <repository-url>
cd netflix_catalogue
```

Install the project dependencies:

```bash
npm install
```

D3.js is already listed as a project dependency, so you don't need to install it separately.

## Start the development server

Run:

```bash
npm run dev
```

Vite will start a local development server. Open the URL shown in the terminal, usually:

```text
http://localhost:5173
```

The page will automatically reload when you modify the source code.

## Project structure

```text
netflix_catalogue/
├── public/
|   └── data/               # Static data files 
|       ├── raw/            # raw csv data from kaggle
|       └── preprocessed/   # preprocessed json data (local folder, added in .gitignore)
├── src/                # Application source code
│   ├── components/     # Reusable UI components
│   ├── data/           # Data loading and processing
│   ├── visualizations/ # D3.js visualizations
│   └── main.js         # Application entry point
├── index.html
├── package.json        # Contains all the dependencies installed with npm
└── README.md
```

## Data preprocessing

`npm run dev` first runs `scripts/preprocess.js` automatically (you can also run it alone with `npm run preprocess`).
It turns the raw Kaggle CSV files of `public/data/raw/` into one clean data table, `public/data/preprocessed/titles.json` (1 row per title), loaded in the app with `loadNetflixData()` from `src/data/loadData.js`.

The pipeline itself is in `src/data/pipeline.js`: the same code runs in Node (default dataset) and in the browser (imported dataset, see below).

0. **Validate**: required columns checked (the file is refused if one is missing); rows without `show_id` or `title`, with a type other than Movie / TV Show or an invalid `release_year` are rejected and counted; duplicated `show_id` keep the last row
1. **Clean**: fix the 3 titles whose duration is in the rating column, parse dates and durations (minutes / seasons)
2. **Join**: add `imdb_score`, `imdb_votes` (Netflix IMDb Scores) and `budget`, `revenue` (IMDb Movies, movies only) using the normalised title + type + release year (±1). Unmatched titles are kept with `null` values. Budgets and revenues with decimals are imputed values in the source and are set to `null`.
3. **Derive**: `main_country`, `production_country_count`, `cast_size`
4. **Pre-classify**: 14 ratings → `age_group` (Kids, Older Kids, Teens, Adults, Unrated); 42 Netflix tags → 21 `genre_families`; region tags → `is_international`

The pipeline report (rejected rows, join match rates, category counts) is written to `public/data/preprocessed/summary.json`.
Filtering and aggregation are done in the browser (e.g. `d3.rollup`) so that every view reacts to the shared filters.

## Change the dataset

The **Dataset** panel at the top of the page lets the user load another CSV in the Kaggle Netflix format. The file goes through the same pipeline (validate, clean, join IMDb, derive, pre-classify), then the filters are reset and every view is redrawn.

- **Replace dataset…**: the imported titles replace the current ones
- **Add update…**: the imported titles are added to the current ones (a title with an existing `show_id` is updated)
- **Back to default**: the Netflix catalogue again

The panel shows the pipeline report: rows read, titles kept, rejected rows and why, IMDb match rate.

Example files in `samples/` (created by `node scripts/make-samples.js` from the raw data):

| File | Try it with | Shows |
|---|---|---|
| `netflix_until_2020.csv` | Replace dataset… | an older version of the catalogue (7,309 titles) |
| `netflix_update_2021.csv` | Add update… (after the previous one) | an update going through the pipeline: +1,498 titles |
| `catalogue_with_errors.csv` | Replace dataset… | the validation: 4 broken rows rejected, 1 duplicate merged |

## Production build (not really useful for now)

To create a production build:

```bash
npm run build
```

The generated application will be placed in:

```text
dist/
```

You can preview the production build locally with:

```bash
npm run preview
```

## Development workflow

After cloning the project, the usual workflow is:

```bash
npm install
npm run dev
```

When you're finished working (see [GIT.md](GIT.md) if you want more details):

```bash
git add .
git commit -m "Describe your changes"
git push
```
