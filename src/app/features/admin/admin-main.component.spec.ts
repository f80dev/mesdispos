import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AdminMain } from './admin-main.component';

describe('AdminMain', () => {
  let component: AdminMain;
  let fixture: ComponentFixture<AdminMain>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminMain],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminMain);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
