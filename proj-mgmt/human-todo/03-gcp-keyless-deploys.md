# 3. Google Cloud: keyless CI deploys ☐

**Why**: CI deploys without any stored key file (GitHub's short-lived OIDC token is exchanged for Google credentials), and the Cloudflare deploy token lives in Secret Manager.

**Needs**: item 2 (the Google Cloud project is created with Firebase).

**Steps**: [docs/setup/accounts-and-deploy.md §2](../../docs/setup/accounts-and-deploy.md):
* ☐ Install the gcloud CLI; `gcloud auth login`; `gcloud config set project <PROJECT_ID>`.
* ☐ Run the §2.2 command block in a terminal **outside `D:\GDrive`** (it enables the APIs, creates the `github` identity pool and provider limited to this repository, and the `lexical-deploy` service account usable only from the `production` environment).
* ☐ Write down: the **project number** and the provider path `projects/<NUMBER>/locations/global/workloadIdentityPools/github/providers/github-actions` (both go into item 5).

**Done when**: `gcloud iam workload-identity-pools providers describe github-actions --location=global --workload-identity-pool=github` shows the attribute condition with this repository.
