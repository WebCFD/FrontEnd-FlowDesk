# Database Integration Tests

## Test 1: User Authentication and Registration
**Objective**: Verify user can register, login, and access their profile

**Steps**:
1. Navigate to Dashboard
2. Click "Sign In / Register" 
3. Create new account with:
   - Username: testuser2
   - Password: password123
   - Email: test2@example.com
   - Full Name: Test User Two
4. Verify successful registration
5. Login with new credentials
6. Check user profile shows correct information
7. Verify default credits (500.00) are assigned

**Expected Result**: User successfully registers, logs in, and sees personal dashboard

## Test 2: Dashboard Simulations Display
**Objective**: Verify Dashboard shows real database simulations

**Steps**:
1. Login as testuser (existing in database)
2. Navigate to Dashboard Overview
3. Check simulations table displays:
   - "Office Building Analysis" (Completed, Professional)
   - "Residential HVAC Study" (Processing, Basic)  
   - "Hospital Thermal Comfort" (Completed, Enterprise)
4. Verify correct status badges (green for completed, blue for processing)
5. Verify "Displaying 3 items" shows correct count
6. Check action dropdown menus work

**Expected Result**: Dashboard displays 3 real simulations from database with correct status and details

## Test 3: Post & Analysis Page Integration
**Objective**: Verify Post & Analysis shows completed simulations

**Steps**:
1. Remain logged in as testuser
2. Navigate to "Post & Analysis" page
3. Verify "Completed Simulations" section shows:
   - "Office Building Analysis" (Professional)
   - "Hospital Thermal Comfort" (Enterprise)
4. Check dropdown excludes "Residential HVAC Study" (still processing)
5. Verify "2 completed simulations" counter is correct
6. Try selecting each simulation from dropdown

**Expected Result**: Only completed simulations appear in dropdown, processing simulations are excluded

## Test 4: Anonymous User Experience
**Objective**: Verify anonymous users see appropriate empty states

**Steps**:
1. Logout (if logged in)
2. Navigate to Dashboard
3. Verify sidebar shows "No login yet"
4. Check simulations table shows "No simulations found" message
5. Navigate to Post & Analysis
6. Verify shows "No Completed Simulations" message
7. Check appropriate call-to-action messages appear

**Expected Result**: Anonymous users see proper empty states with guidance to login/register

## Test 5: Database Operations via API
**Objective**: Test CRUD operations work correctly

**Steps**:
1. Login as testuser
2. Open browser developer tools (F12)
3. Check Network tab for API calls:
   - `/api/auth/user` returns user data
   - `/api/simulations` returns user's simulations
   - `/api/simulations/completed` returns only completed ones
4. Verify response formats match schema types
5. Check no 500 errors in console

**Expected Result**: All API endpoints return correct data formats with proper authentication

## Test 6: Credits System
**Objective**: Verify credits are tracked correctly

**Steps**:
1. Login as testuser
2. Check user profile shows correct credits (750.00)
3. Navigate between pages
4. Verify credits persist across sessions
5. Check database directly shows correct credit values

**Expected Result**: Credits display correctly and persist across navigation

## Test 7: User Isolation
**Objective**: Verify users only see their own simulations

**Steps**:
1. Create second user account
2. Login as second user
3. Navigate to Dashboard
4. Verify empty simulations table (new user has no simulations)
5. Switch back to testuser account
6. Verify original 3 simulations still visible
7. Confirm users can't access each other's data

**Expected Result**: Users only see their own simulations, proper data isolation

## Test 8: Error Handling
**Objective**: Test graceful error handling

**Steps**:
1. Temporarily disconnect internet (simulate network error)
2. Navigate to Dashboard
3. Verify "Error loading simulations" message appears
4. Reconnect internet and refresh
5. Check simulations load correctly
6. Test with invalid user credentials

**Expected Result**: Appropriate error messages display, graceful recovery when connection restored

## Database Verification Commands

Check user data:
```sql
SELECT id, username, email, full_name, credits FROM users;
```

Check simulation data:
```sql
SELECT id, user_id, name, status, simulation_type, package_type, cost, created_at FROM simulations;
```

Check completed simulations:
```sql
SELECT * FROM simulations WHERE status = 'completed';
```

## Success Criteria
- All tests pass without errors
- Database operations work correctly
- User authentication functions properly
- Simulations display with correct data
- Proper error handling and empty states
- User data isolation maintained
- Credits system functions correctly