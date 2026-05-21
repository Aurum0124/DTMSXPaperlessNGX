# Document Tracking X PaperlessNGX

A modern document management and tracking system built with React, designed for government workflows and integrated with Paperless-ngx.

## 🚀 Features

- **Custom Tracking Codes:** Search and track documents using unique codes (TRK-YYYY-XXXX format).
- **Department-Based Management:** Multi-department interface with role-based access control.
- **Document Status Management:** Track the lifecycle of documents (Under Review, Approved, Rejected, etc.).
- **Document Forwarding:** Seamlessly forward documents between departments.
- **File Upload & Processing:** Upload new documents with automatic tracking code generation.
- **Real-Time Status Updates:** Live polling for document processing status.
- **Responsive Design:** Modern, mobile-friendly user interface.
- **Integration with Paperless-ngx:** Connects to Paperless-ngx for backend document management.
- **Custom Fields:** Store tracking codes and status information.
- **Filtering & Search:** Find documents by various criteria.
- **Role-Based Access:** Secure access for different department roles.
- **Optimized for Government Workflows:** Designed for public sector document management.

---

## 🗺️ Frontend Routing

The application uses **React Router** for client-side routing. The main routes are:

| Path                  | Component                | Description                                                                 |
|-----------------------|-------------------------|-----------------------------------------------------------------------------|
| `/login`              | `LoginForm`             | Login page for department staff.                                            |
| `/pgin-receiving`     | `DepartmentDashboard`   | Dashboard for the Receiving Office.                                         |
| `/pgin-hr`            | `DepartmentDashboard`   | Dashboard for the Human Resource Department.                                |
| `/pgin-oba`           | `DepartmentDashboard`   | Dashboard for the Office of Barangay Affairs.                               |
| `/pgin-govoffice`     | `DepartmentDashboard`   | Dashboard for the Governor's Office.                                        |
| `/*` (any other path) | `PublicTracker`         | Public document tracking interface (default for citizens and unknown paths). |

---

## Public Tracker

<img width="1916" height="915" alt="LOGIN" src="https://github.com/user-attachments/assets/450326a5-25b3-4ef5-8481-55b26cd922bd" />

---

## Login

<img width="1918" height="906" alt="loggingin" src="https://github.com/user-attachments/assets/ee914561-181c-4b6a-9086-5671f01f87ca" />

---

## Department Dashboard

<img width="1920" height="914" alt="dashboard" src="https://github.com/user-attachments/assets/7c56eede-866e-487f-8255-66057a529e17" />

---


## 📄 Document List View Features

The Document List view provides a powerful interface for managing and tracking documents within each department. Key features include:

- **Document Card View:**
  
  Displays documents as cards with key details for quick visual scanning.  

  <img width="782" height="511" alt="card" src="https://github.com/user-attachments/assets/abb83efd-aabc-40bf-a0bd-a9222c96e8a3" />

- **One-Liner View:**
  
  Switch to a compact, table-like row view for dense information display.  

  <img width="1581" height="206" alt="1 liner" src="https://github.com/user-attachments/assets/3bcbeb2a-c766-416a-a3c9-731ef402f4ef" />
  
- **One-Liner (Thumbnail) View:**
  
  Switch to a compact, table-like row view for dense information display.  

  <img width="1582" height="599" alt="thumb1" src="https://github.com/user-attachments/assets/8fb90beb-b879-40ec-aeb3-d92d51ff56fc" />

- **Search by Tracking Code and Status Filtering:**
  
  Instantly find documents using their unique tracking code (TRK-YYYY-XXXX format).  
  Filter documents by their current status (e.g., Under Review, Approved, Rejected).

  <img width="747" height="85" alt="searhnfilter" src="https://github.com/user-attachments/assets/dbc37017-53f1-4b42-8efc-e7b084b8c8a4" />

- **Department Forwarding:**
  
  Forward document to another department.

  <img width="363" height="519" alt="forwarding" src="https://github.com/user-attachments/assets/2e71b8b9-7eb0-4be7-8a9d-97c6ca0488fc" />
  
- **View Document:**
  
  <img width="1920" height="912" alt="documenthistory" src="https://github.com/user-attachments/assets/e32423b4-c0c4-4a3e-8592-bc6e2859003f" />

---




